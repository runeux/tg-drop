import { createServer } from 'node:http';
import { mkdir } from 'node:fs/promises';
import QRCode from 'qrcode';
import { telegramClient } from '../server/storage/telegram.js';
import { resolve } from 'node:path';

const directory = resolve(process.env.DATA_DIR ?? './data');
await mkdir(directory, { recursive: true, mode: 0o700 });
const client = telegramClient({
  TG_API_ID: Number(process.env.TG_API_ID),
  TG_API_HASH: process.env.TG_API_HASH,
  DATA_DIR: directory,
});

let qr = '';
let done = false;
let passwordResolve: ((password: string) => void) | undefined;
const port = Number(process.env.SETUP_PORT ?? 8790);
const origin = `http://127.0.0.1:${port}`;

const server = createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Frame-Options', 'DENY');
  if (req.method === 'GET' && req.url === '/status') {
    res.setHeader('Content-Type', 'application/json');
    const status = { qr, done, password: Boolean(passwordResolve) };
    res.end(JSON.stringify(status), () => {
      if (status.done) server.close();
    });
    return;
  }
  if (req.method === 'POST' && req.url === '/password') {
    if (
      req.headers.origin !== origin ||
      req.headers['content-type'] !== 'text/plain'
    ) {
      res.writeHead(403).end();
      return;
    }
    let password = '';
    for await (const chunk of req) {
      password += String(chunk);
      if (password.length > 1024) {
        res.writeHead(413).end();
        return;
      }
    }
    passwordResolve?.(password);
    passwordResolve = undefined;
    res.end();
    return;
  }
  if (req.method !== 'GET' || req.url !== '/') {
    res.writeHead(404).end();
    return;
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(`<!doctype html><html><meta name="viewport" content="width=device-width,initial-scale=1"><title>telegram · drop</title>
    <style>:root{color-scheme:dark;font-family:system-ui;background:#090909;color:#eee}body{min-height:90vh;display:grid;place-items:center;margin:0}main{text-align:center}img{width:280px;border-radius:20px}p{color:#aaa;font-size:14px}input,button{font:inherit;border:0;background:#242424;color:#eee;border-radius:12px;padding:14px}button{cursor:pointer}form[hidden],img[hidden]{display:none}</style>
    <main><img id="qr" alt="telegram login qr"><p id="label">telegram → settings → devices → link desktop device</p><form hidden><input type="password" placeholder="2FA password" autocomplete="current-password" aria-label="Telegram 2FA password" required><button>→</button></form></main>
    <script>const image=document.querySelector('img'),form=document.querySelector('form'),label=document.querySelector('p');
    const timer=setInterval(async()=>{const s=await fetch('/status').then(r=>r.json());if(s.qr&&image.src!==s.qr)image.src=s.qr;image.hidden=s.password||s.done;form.hidden=!s.password;label.textContent=s.done?'connected ✓':s.password?'telegram 2FA':'telegram → settings → devices → link desktop device';if(s.done)clearInterval(timer)},1000);
    form.onsubmit=async e=>{e.preventDefault();await fetch('/password',{method:'POST',headers:{'Content-Type':'text/plain'},body:form.querySelector('input').value});form.reset()};</script></html>`);
});
server.listen(port, '127.0.0.1', () =>
  console.log(`telegram setup: ${origin}`),
);

try {
  await client.start({
    qrCodeHandler: (url) => {
      void QRCode.toDataURL(url, { width: 560, margin: 3 }).then((value) => {
        qr = value;
      });
    },
    password: () =>
      new Promise<string>((resolvePassword) => {
        passwordResolve = resolvePassword;
      }),
    invalidCodeCallback: () => console.log('invalid password; try again'),
  });
  await client.destroy();
  done = true;
  console.log('telegram connected');
} catch (error) {
  console.error(
    error instanceof Error ? error.message : 'telegram login failed',
  );
  server.close();
  await client.destroy();
  process.exitCode = 1;
}

process.on('SIGTERM', () => {
  server.close();
  void client.destroy();
});
process.on('SIGINT', () => {
  server.close();
  void client.destroy();
});
