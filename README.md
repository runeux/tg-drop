<h1 align="center">drop</h1>

<p align="center">files in. code out.</p>

<p align="center">
  <a href="https://f.mythra.pw">f.mythra.pw</a>
</p>

<p align="center">
  <img src="docs/home.png" alt="drop — code or password" width="960" />
</p>

enter a code to find a file or use the sign-in icon to unlock uploads. drop anywhere. open a row to peek at the file or use its download and copy actions.

password protected uploads · telegram storage · private channel sync · manual removal

photos, videos, and documents sent to the storage channel are imported automatically, including existing history. each album item gets its own code. photos download as telegram's available jpeg version; original document and video filenames are preserved when available.

the dashboard lists all uploads together. images and videos open a fullscreen viewer, while files without a media preview show their details and an icon from [material icon theme](https://github.com/material-extensions/vscode-material-icon-theme).

### run

node.js 24 lts and ffmpeg (including ffprobe) are required. get telegram api credentials from [my.telegram.org](https://my.telegram.org/apps).

```sh
npm ci
npm run setup
npm run telegram:login
npm run dev
```

### layout

```text
src/             react interface
server/          hono api, queue, sqlite, storage
shared/          file schemas and formatting
scripts/         setup and telegram login
tests/           api and browser tests
deploy/          caddy configuration
```

```sh
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium webkit
npm run test:e2e
```

[deployment notes](docs/deployment.md)
