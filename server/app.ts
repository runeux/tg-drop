import { Hono } from 'hono';
import type { HttpBindings } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { bodyLimit } from 'hono/body-limit';
import { secureHeaders } from 'hono/secure-headers';
import { stream as streamResponse } from 'hono/streaming';
import { z, ZodError } from 'zod';
import { expirationSchema } from '../shared/files.js';
import { HttpError } from './errors.js';
import {
  normalizeCode,
  RateLimiter,
  signToken,
  verifyPassword,
  verifyToken,
} from './security.js';
import type { Config } from './config.js';
import type { Files } from './files.js';

const SESSION_COOKIE = 'drop_session';
const SESSION_TTL = 7 * 86_400_000;
const uploadSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(255),
  size: z.coerce.number().int().positive(),
  expiration: expirationSchema,
  mime: z.string().max(128),
});

export function createApp(config: Config, files: Files, serveClient = true) {
  const app = new Hono<{ Bindings: HttpBindings }>();
  const limiter = new RateLimiter();

  app.use(
    '*',
    secureHeaders({
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'self'"],
      },
      referrerPolicy: 'no-referrer',
      xFrameOptions: 'DENY',
      strictTransportSecurity: 'max-age=31536000',
    }),
  );

  app.use('/api/*', async (c, next) => {
    c.header('Cache-Control', 'no-store');
    if (
      !['GET', 'HEAD'].includes(c.req.method) &&
      c.req.header('origin') !== config.ORIGIN
    ) {
      throw new HttpError(403, 'Request not allowed.');
    }
    await next();
  });

  app.use('/api/session', bodyLimit({ maxSize: 4096 }));
  app.use('/api/lookup', bodyLimit({ maxSize: 4096 }));

  app.post('/api/session', async (c) => {
    const ip =
      c.req.header('x-forwarded-for') ??
      c.env?.incoming.socket.remoteAddress ??
      'test';
    limiter.check('password:global', 120);
    limiter.check(`password:${ip}`, 8);
    const { password } = z
      .object({ password: z.string().max(256) })
      .parse(await c.req.json());
    if (!verifyPassword(password, config.PASSWORD_HASH))
      throw new HttpError(401, 'Incorrect password.');
    setCookie(
      c,
      SESSION_COOKIE,
      signToken(config.SESSION_SECRET, 'session', 'owner', SESSION_TTL),
      {
        httpOnly: true,
        secure: config.ORIGIN.startsWith('https:'),
        sameSite: 'Strict',
        path: '/api',
        maxAge: SESSION_TTL / 1000,
      },
    );
    return c.json({ ok: true });
  });

  app.get('/api/session', (c) =>
    c.json({
      authenticated: Boolean(
        verifyToken(
          config.SESSION_SECRET,
          getCookie(c, SESSION_COOKIE) ?? '',
          'session',
        ),
      ),
      maxFileBytes: config.MAX_FILE_BYTES,
    }),
  );
  app.delete('/api/session', (c) => {
    deleteCookie(c, SESSION_COOKIE, { path: '/api' });
    return c.json({ ok: true });
  });

  app.post('/api/lookup', async (c) => {
    const ip =
      c.req.header('x-forwarded-for') ??
      c.env?.incoming.socket.remoteAddress ??
      'test';
    limiter.check('lookup:global', 600);
    limiter.check(`lookup:${ip}`, 30);
    const { code } = z
      .object({ code: z.string().max(64) })
      .parse(await c.req.json());
    const normalized = normalizeCode(code);
    if (!normalized) throw new HttpError(404, 'Code not found or expired.');
    const file = files.lookup(normalized);
    const token = signToken(
      config.SESSION_SECRET,
      'download',
      file.id,
      10 * 60_000,
    );
    return c.json({
      name: file.name,
      size: file.size,
      url: `/api/download/${token}`,
    });
  });

  app.on(['GET', 'HEAD'], '/api/download/:token', async (c) => {
    const id = verifyToken(
      config.SESSION_SECRET,
      c.req.param('token'),
      'download',
    );
    if (!id) throw new HttpError(404, 'Link expired. Enter the code again.');
    // head requests and prefetchers must never consume one-time files.
    if (c.req.method === 'HEAD') return c.body(null, 405);
    if (c.req.header('sec-purpose')?.includes('prefetch'))
      throw new HttpError(403, 'Prefetch is disabled.');
    const { file, stream } = await files.open(id);
    let sent = 0;
    let finished = false;
    const settle = (complete: boolean) => {
      if (finished) return;
      finished = true;
      stream.destroy();
      files.finishDownload(file, complete && sent === file.size);
    };
    c.env.outgoing.once('finish', () => settle(true));
    c.env.outgoing.once('close', () => settle(c.env.outgoing.writableFinished));
    const encoded = encodeURIComponent(file.name).replace(
      /['()*]/g,
      (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
    );
    c.header('Content-Type', 'application/octet-stream');
    c.header('Content-Length', String(file.size));
    c.header(
      'Content-Disposition',
      `attachment; filename="download"; filename*=UTF-8''${encoded}`,
    );
    return streamResponse(
      c,
      async (body) => {
        body.onAbort(() => settle(false));
        for await (const chunk of stream) {
          if (!(chunk instanceof Uint8Array))
            throw new Error('invalid file chunk');
          await body.write(chunk);
          sent += chunk.length;
        }
      },
      async () => settle(false),
    );
  });

  app.use('/api/files/*', async (c, next) => {
    if (
      !verifyToken(
        config.SESSION_SECRET,
        getCookie(c, SESSION_COOKIE) ?? '',
        'session',
      )
    )
      throw new HttpError(401, 'Sign in again.');
    await next();
  });
  app.get('/api/files', (c) => c.json({ files: files.list() }));
  app.post('/api/files', async (c) => {
    let name: string;
    try {
      name = decodeURIComponent(c.req.header('x-file-name') ?? '');
    } catch {
      throw new HttpError(400, 'Invalid file name.');
    }
    name = Array.from(name, (char) => {
      const point = char.codePointAt(0) ?? 0;
      return point < 32 || point === 127 || char === '/' || char === '\\'
        ? '_'
        : char;
    })
      .join('')
      .trim();
    const meta = uploadSchema.parse({
      id: c.req.header('x-upload-id'),
      name,
      size: c.req.header('x-file-size'),
      expiration: c.req.header('x-expiration'),
      mime: c.req.header('content-type') ?? 'application/octet-stream',
    });
    if (meta.size > config.MAX_FILE_BYTES)
      throw new HttpError(413, 'Maximum file size is 2 GB.');
    const id = await files.receive(c.env.incoming, meta);
    return c.json({ id }, 201);
  });
  app.delete('/api/files/:id', (c) => {
    files.delete(c.req.param('id'));
    return c.json({ ok: true });
  });
  app.post('/api/files/:id/retry', (c) => {
    files.retry(c.req.param('id'));
    return c.json({ ok: true });
  });
  app.get('/api/health', (c) => c.json({ ok: true }));
  app.all('/api/*', (c) => c.json({ error: 'Not found.' }, 404));

  if (serveClient) {
    app.use('/assets/*', async (c, next) => {
      c.header('Cache-Control', 'public, max-age=31536000, immutable');
      await next();
    });
    app.use('*', serveStatic({ root: './dist/client' }));
    app.get('*', serveStatic({ path: './dist/client/index.html' }));
  }

  app.onError((error, c) => {
    if (error instanceof HttpError)
      return c.json({ error: error.message }, error.status);
    if (error instanceof ZodError || error instanceof SyntaxError)
      return c.json({ error: 'Invalid request.' }, 400);
    console.error('request failed', error.name);
    return c.json({ error: 'Something went wrong. Try again.' }, 500);
  });
  return app;
}
