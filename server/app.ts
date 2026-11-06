import { createHmac, randomBytes } from 'node:crypto';
import { Hono, type Context } from 'hono';
import type { HttpBindings } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { bodyLimit } from 'hono/body-limit';
import { secureHeaders } from 'hono/secure-headers';
import { stream as streamResponse } from 'hono/streaming';
import { z, ZodError } from 'zod';
import { HttpError } from './errors.js';
import { formatSize } from '../shared/files.js';
import { mediaType } from '../shared/media.js';
import { byteRange } from './byte-range.js';
import {
  normalizeCode,
  signToken,
  verifyPassword,
  verifyToken,
} from './security.js';
import type { Config } from './config.js';
import type { Files } from './files.js';

const SESSION_COOKIE = 'drop_session';
// browsers cap persistent cookies at 400 days; active sessions renew this window.
const SESSION_MAX_AGE = 400 * 86_400;
type AppContext = Context<{ Bindings: HttpBindings }>;
const uploadSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(255),
  size: z.coerce.number().int().positive(),
  mime: z.string().max(128),
});

export function createApp(config: Config, files: Files, serveClient = true) {
  const app = new Hono<{ Bindings: HttpBindings }>();
  const sessionDigest = (token: string) =>
    createHmac('sha256', config.SESSION_SECRET)
      .update(config.PASSWORD_HASH)
      .update('\0')
      .update(token)
      .digest('hex');
  const sessionToken = (c: AppContext) => getCookie(c, SESSION_COOKIE) ?? '';
  const authenticated = (c: AppContext) => {
    const token = sessionToken(c);
    return (
      /^[a-f0-9]{64}$/.test(token) && files.db.hasSession(sessionDigest(token))
    );
  };
  const persistSession = (c: AppContext, token: string) =>
    setCookie(c, SESSION_COOKIE, token, {
      httpOnly: true,
      secure: config.ORIGIN.startsWith('https:'),
      sameSite: 'Strict',
      path: '/api',
      maxAge: SESSION_MAX_AGE,
    });
  const unlock = (c: AppContext) => {
    files.db.deleteSession(sessionDigest(sessionToken(c)));
    const token = randomBytes(32).toString('hex');
    files.db.createSession(sessionDigest(token));
    persistSession(c, token);
  };
  const downloadDetails = (file: {
    id: string;
    name: string;
    size: number;
  }) => ({
    name: file.name,
    size: file.size,
    url: `/api/download/${signToken(config.SESSION_SECRET, 'file-download', file.id, 10 * 60_000)}`,
  });

  app.use('/api/files/:id/preview', async (c, next) => {
    await next();
    c.header('Content-Security-Policy', "sandbox; default-src 'none'");
  });

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
  app.use('/api/resolve', bodyLimit({ maxSize: 4096 }));

  for (const path of ['/api/resolve', '/api/session', '/api/lookup']) {
    app.use(path, async (c, next) => {
      if (c.req.method !== 'POST' || authenticated(c)) return next();
      const address =
        c.req.header('x-forwarded-for') ??
        c.env?.incoming.socket.remoteAddress ??
        'unknown';
      await files.db.authLimiter.run(address, async () => {
        await next();
        return ![400, 401, 404].includes(c.res.status);
      });
    });
  }

  app.post('/api/resolve', async (c) => {
    const { value } = z
      .object({ value: z.string().min(1).max(256) })
      .parse(await c.req.json());
    if (verifyPassword(value, config.PASSWORD_HASH)) {
      unlock(c);
      return c.json({ kind: 'upload' });
    }
    const code = normalizeCode(value);
    if (!code) throw new HttpError(404, 'Code not found.');
    return c.json({ kind: 'download', ...downloadDetails(files.lookup(code)) });
  });

  app.post('/api/session', async (c) => {
    const { password } = z
      .object({ password: z.string().max(256) })
      .parse(await c.req.json());
    if (!verifyPassword(password, config.PASSWORD_HASH))
      throw new HttpError(401, 'Incorrect password.');
    unlock(c);
    return c.json({ ok: true });
  });

  app.get('/api/session', (c) => {
    const authorized = authenticated(c);
    if (authorized) persistSession(c, sessionToken(c));
    return c.json({
      authenticated: authorized,
      maxFileBytes: config.MAX_FILE_BYTES,
    });
  });
  app.delete('/api/session', (c) => {
    files.db.deleteSession(sessionDigest(sessionToken(c)));
    deleteCookie(c, SESSION_COOKIE, { path: '/api' });
    return c.json({ ok: true });
  });

  app.post('/api/lookup', async (c) => {
    const { code } = z
      .object({ code: z.string().max(64) })
      .parse(await c.req.json());
    const normalized = normalizeCode(code);
    if (!normalized) throw new HttpError(404, 'Code not found.');
    const file = files.lookup(normalized);
    return c.json(downloadDetails(file));
  });

  const sendFile = async (c: AppContext, id: string, preview = false) => {
    if (!preview && c.req.method === 'HEAD') return c.body(null, 405);
    if (c.req.header('sec-purpose')?.includes('prefetch'))
      throw new HttpError(403, 'Prefetch is disabled.');
    const metadata = files.ready(id);
    const mime = preview ? mediaType(metadata) : 'application/octet-stream';
    if (!mime) throw new HttpError(415, 'Preview unavailable.');
    let range;
    if (preview) {
      c.header('Accept-Ranges', 'bytes');
      const header = c.req.header('range');
      if (header && !c.req.header('if-range')) {
        try {
          range = byteRange(header, metadata.size);
        } catch (error) {
          c.header('Content-Range', `bytes */${metadata.size}`);
          throw error;
        }
      }
    }
    const transfer =
      preview && c.req.method === 'HEAD' ? null : await files.open(id, range);
    if (transfer && (c.env.outgoing.destroyed || c.req.raw.signal.aborted)) {
      transfer.stream.destroy();
      files.finishDownload(transfer.file);
      return c.body(null, 400);
    }
    c.header('Content-Type', mime);
    c.header(
      'Content-Length',
      String(range ? range.end - range.start + 1 : metadata.size),
    );
    if (range) {
      c.status(206);
      c.header(
        'Content-Range',
        `bytes ${range.start}-${range.end}/${metadata.size}`,
      );
    }
    if (!transfer) return c.body(null);
    const { file, stream } = transfer;
    let finished = false;
    const settle = () => {
      if (finished) return;
      finished = true;
      stream.destroy();
      files.finishDownload(file);
    };
    c.env.outgoing.once('finish', settle);
    c.env.outgoing.once('close', settle);
    const encoded = encodeURIComponent(file.name).replace(
      /['()*]/g,
      (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
    );
    c.header(
      'Content-Disposition',
      `${preview ? 'inline' : 'attachment'}; filename="download"; filename*=UTF-8''${encoded}`,
    );
    return streamResponse(
      c,
      async (body) => {
        body.onAbort(settle);
        for await (const chunk of stream) {
          if (!(chunk instanceof Uint8Array))
            throw new Error('invalid file chunk');
          await body.write(chunk);
        }
      },
      async () => settle(),
    );
  };

  app.on(['GET', 'HEAD'], '/api/download/:token', async (c) => {
    const id = verifyToken(
      config.SESSION_SECRET,
      c.req.param('token'),
      'file-download',
    );
    if (!id) throw new HttpError(404, 'Link expired. Enter the code again.');
    return sendFile(c, id);
  });

  app.use('/api/files/*', async (c, next) => {
    if (!authenticated(c)) throw new HttpError(401, 'Sign in again.');
    await next();
  });
  app.get('/api/files', (c) => c.json({ files: files.list() }));
  app.on(['GET', 'HEAD'], '/api/files/:id/preview', (c) =>
    sendFile(c, c.req.param('id'), true),
  );
  app.on(['GET', 'HEAD'], '/api/files/:id/download', (c) =>
    sendFile(c, c.req.param('id')),
  );
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
      mime: c.req.header('content-type') ?? 'application/octet-stream',
    });
    if (meta.size > config.MAX_FILE_BYTES)
      throw new HttpError(
        413,
        `Maximum file size is ${formatSize(config.MAX_FILE_BYTES)}.`,
      );
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
    if (error instanceof HttpError) {
      if (error.retryAfter) c.header('Retry-After', String(error.retryAfter));
      return c.json({ error: error.message }, error.status);
    }
    if (error instanceof ZodError || error instanceof SyntaxError)
      return c.json({ error: 'Invalid request.' }, 400);
    console.error('request failed', error.name);
    return c.json({ error: 'Something went wrong. Try again.' }, 500);
  });
  return app;
}
