<h1 align="center">drop</h1>

<p align="center">files in. code out.</p>

<p align="center">
  <a href="https://f.mythra.pw">f.mythra.pw</a>
</p>

<p align="center">
  <img src="docs/home.png" alt="drop — code or password" width="960" />
</p>

enter a password to upload or a code to download. drop anywhere. click a filename to download, or its code to copy.

password protected uploads · telegram storage · private channel sync · manual removal

photos, videos, and documents sent to the storage channel are imported automatically, including existing history. each album item gets its own code. photos download as telegram's available jpeg version; original document and video filenames are preserved when available.

the dashboard separates files from a masonry gallery of images, gifs, and videos. previews keep their aspect ratios, open in a fullscreen viewer, and support downloading or copying a code. formats the browser cannot display remain downloadable.

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
