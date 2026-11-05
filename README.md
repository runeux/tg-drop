<h1 align="center">drop</h1>

<p align="center">files in. code out.</p>

<p align="center">
  <a href="https://f.mythra.pw">f.mythra.pw</a>
</p>

<p align="center">
  <img src="docs/home.png" alt="drop — upload and download" width="960" />
</p>

drop anywhere to upload. click a code to copy. enter it on another device to download.

password protected uploads · telegram storage · up to 2 gb per file · manual removal

<details>
<summary>uploads</summary>

<img src="docs/uploads.png" alt="drop — file list and copyable codes" width="960" />

</details>

### run

node.js 24 lts. get telegram api credentials from [my.telegram.org](https://my.telegram.org/apps).

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
