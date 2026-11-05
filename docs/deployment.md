# deployment

react + uppy → hono → sqlite/drizzle + p-queue → mtcute → telegram saved messages. caddy terminates https.

the custom service keeps the two-action interface and code-based access small. teledrive's drive dashboard and filesystem model are unnecessary for this flow.

the minimatch 11 override fixes [glob amplification in lint tooling](https://github.com/advisories/GHSA-g3hv-75wg-m249). remove it when those upstream dependencies accept the patched major.

## server

- source/build: `/srv/tg-drop/app`
- data: `/srv/tg-drop/data` (container uid 1000, mode 0700)
- secrets: `/etc/tg-drop.env` (root, mode 0600)
- caddy: `/etc/caddy/tg-drop.Caddyfile`, imported by `/etc/caddy/Caddyfile`
- backend: `127.0.0.1:8787`

set `ORIGIN=https://f.mythra.pw` and `DATA_DIR=/data` in the server environment. copy the closed telegram session into the data directory before startup. never run the same session on two machines simultaneously.

```sh
npm ci
npm run build
rsync -az Dockerfile .dockerignore compose.yaml package.json package-lock.json dist aeza:/srv/tg-drop/app/
ssh aeza 'cd /srv/tg-drop/app && docker compose up -d --build'
```

```sh
ssh aeza 'cd /srv/tg-drop/app && docker compose ps'
ssh aeza 'cd /srv/tg-drop/app && docker compose logs --tail=100'
```

## behavior

- files stream to temporary disk, then enter a persistent, sequential telegram queue. codes appear after telegram confirms storage.
- staging is limited to 2.5 gb; each file is limited to 2 gb. uploads also check free disk space and keep a 256 mb reserve.
- files and codes remain available until manual removal. downloads can run concurrently; deletion waits for active transfers.
- manual removal revokes access immediately. cleanup retries telegram deletion every 30 seconds if telegram is unavailable.
- telegram stores the original documents in saved messages. manually deleting them there makes those files unavailable.
- browser uploads retry connection/server errors, but do not resume a partial file after a page reload. files already received by the server continue processing.

sqlite and the telegram session are required to recover file access. back up `/srv/tg-drop/data` and `/etc/tg-drop.env` while the container is stopped, or use sqlite's online backup api. keep backups private. the vps stores metadata and temporary uploads; telegram is the final file store.
