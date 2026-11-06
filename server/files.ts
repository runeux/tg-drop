import { createWriteStream } from 'node:fs';
import { mkdir, readdir, rename, statfs, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { IncomingMessage } from 'node:http';
import PQueue from 'p-queue';
import type { Config } from './config.js';
import { FileDatabase, type FileRecord } from './database.js';
import type { ByteRange, FileStorage } from './storage/types.js';
import type { DropFile } from '../shared/files.js';
import { generateCode } from './security.js';
import { HttpError } from './errors.js';
import { imageDimensions, probeDimensions } from './media-dimensions.js';
import { mediaKind } from '../shared/media.js';

export class Files {
  readonly db: FileDatabase;
  private queue = new PQueue({ concurrency: 1 });
  private scheduled = new Set<string>();
  private progress = new Map<string, number>();
  private uploads = new Map<string, number>();
  private downloading = new Map<string, number>();
  private collecting: Promise<void> | null = null;
  private collectAgain = false;
  private timer?: NodeJS.Timeout;

  constructor(
    private config: Config,
    private storage: FileStorage,
  ) {
    this.db = new FileDatabase(config.DATA_DIR);
  }

  path(id: string) {
    return join(this.config.DATA_DIR, 'staging', id);
  }

  async start() {
    for (const file of this.db.list()) {
      if (
        file.status !== 'ready' ||
        !file.storageKey ||
        file.width ||
        mediaKind(file) !== 'image'
      )
        continue;
      try {
        const stream = await this.storage.open(file.storageKey, {
          start: 0,
          end: Math.min(file.size - 1, 262143),
        });
        const dimensions = imageDimensions(
          Buffer.concat(await stream.toArray()),
        );
        this.db.update(file.id, dimensions);
      } catch (error) {
        console.warn(
          'image metadata backfill failed',
          error instanceof Error ? error.name : 'unknown',
        );
      }
    }
    await mkdir(join(this.config.DATA_DIR, 'staging'), {
      recursive: true,
      mode: 0o700,
    });
    const known = new Set(this.db.list().map((file) => file.id));
    for (const name of await readdir(join(this.config.DATA_DIR, 'staging'))) {
      if (!known.has(name)) await this.removeStaging(name);
    }
    for (const file of this.db.pending()) this.enqueue(file.id);
    await this.collect();
    this.timer = setInterval(() => {
      void this.collect();
    }, 30_000);
    this.timer.unref();
  }

  list(): DropFile[] {
    return this.db.list().flatMap((file) => {
      if (file.status === 'deleting') return [];
      return [
        {
          id: file.id,
          name: file.name,
          size: file.size,
          mime: file.mime,
          width: file.width,
          height: file.height,
          code: file.status === 'ready' ? file.code : '',
          createdAt: file.createdAt,
          status: file.status,
          progress: this.progress.get(file.id) ?? 0,
        },
      ];
    });
  }

  async receive(
    request: IncomingMessage,
    meta: {
      id: string;
      name: string;
      size: number;
      mime: string;
    },
  ) {
    if (this.uploads.has(meta.id))
      throw new HttpError(409, 'This file is already uploading.');
    const existing = this.db.get(meta.id);
    if (existing) {
      request.resume();
      return existing.id;
    }
    const reserved =
      [...this.uploads.values()].reduce((a, b) => a + b, 0) +
      this.db
        .list()
        .filter((file) => file.status !== 'ready')
        .reduce((sum, file) => sum + file.size, 0);
    if (reserved + meta.size > this.config.MAX_STAGING_BYTES)
      throw new HttpError(507, 'Upload queue is full. Try again shortly.');
    this.uploads.set(meta.id, meta.size);
    try {
      const disk = await statfs(this.config.DATA_DIR);
      const receiving = [...this.uploads.values()].reduce(
        (sum, size) => sum + size,
        0,
      );
      if (disk.bavail * disk.bsize < receiving + 256_000_000)
        throw new HttpError(507, 'Not enough temporary space.');
      let received = 0;
      const limit = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          received += chunk.length;
          callback(
            received > meta.size
              ? new HttpError(413, 'File is too large.')
              : null,
            chunk,
          );
        },
      });
      await pipeline(
        request,
        limit,
        createWriteStream(this.path(`${meta.id}.part`), {
          flags: 'wx',
          mode: 0o600,
        }),
      );
      if (received !== meta.size)
        throw new HttpError(400, 'Upload was interrupted. Try again.');
      await rename(this.path(`${meta.id}.part`), this.path(meta.id));
      const dimensions = await probeDimensions(this.path(meta.id), meta);
      this.db.insert({
        ...meta,
        ...dimensions,
        createdAt: Date.now(),
        code: generateCode(),
        status: 'queued',
        storageKey: null,
      });
      this.enqueue(meta.id);
      return meta.id;
    } catch (error) {
      await this.removeStaging(`${meta.id}.part`);
      if (!this.db.get(meta.id)) await this.removeStaging(meta.id);
      throw error;
    } finally {
      this.uploads.delete(meta.id);
    }
  }

  retry(id: string) {
    const file = this.db.get(id);
    if (!file || file.status !== 'failed')
      throw new HttpError(404, 'File not found.');
    this.db.update(id, { status: 'queued' });
    this.enqueue(id);
  }

  private enqueue(id: string) {
    if (this.scheduled.has(id)) return;
    this.scheduled.add(id);
    void this.queue
      .add(async () => {
        const file = this.db.get(id);
        if (!file || file.status !== 'queued') return;
        this.db.update(id, { status: 'storing' });
        try {
          const key = await this.storage.put(this.path(id), file, (value) =>
            this.progress.set(id, value),
          );
          const deleted = this.db.get(id)?.status === 'deleting';
          this.db.update(id, {
            storageKey: key,
            status: deleted ? 'deleting' : 'ready',
          });
        } catch (error) {
          if (this.db.get(id)?.status !== 'deleting')
            this.db.update(id, { status: 'failed' });
          console.error(
            'file storage failed',
            id,
            error instanceof Error ? error.message : 'unknown',
          );
        } finally {
          this.progress.delete(id);
        }
        if (this.db.get(id)?.storageKey) {
          await this.removeStaging(id).catch((error: unknown) =>
            console.error(
              'staging cleanup failed',
              id,
              error instanceof Error ? error.message : 'unknown',
            ),
          );
        }
      })
      .catch((error: unknown) =>
        console.error(
          'queue failed',
          error instanceof Error ? error.name : 'unknown',
        ),
      )
      .finally(() => {
        this.scheduled.delete(id);
        void this.collect();
      });
  }

  lookup(code: string) {
    const file = this.db.byCode(code);
    if (!file) throw new HttpError(404, 'Code not found.');
    return file;
  }

  ready(id: string) {
    const file = this.db.get(id);
    if (!file || file.status !== 'ready' || !file.storageKey)
      throw new HttpError(404, 'File not found.');
    return { ...file, storageKey: file.storageKey };
  }

  async open(id: string, range?: ByteRange) {
    const file = this.ready(id);
    this.downloading.set(id, (this.downloading.get(id) ?? 0) + 1);
    try {
      const stream = await this.storage.open(file.storageKey, range);
      return { file, stream };
    } catch (error) {
      this.releaseDownload(id);
      throw error;
    }
  }

  finishDownload(file: FileRecord) {
    this.releaseDownload(file.id);
    void this.collect();
  }

  private releaseDownload(id: string) {
    const remaining = (this.downloading.get(id) ?? 1) - 1;
    if (remaining > 0) this.downloading.set(id, remaining);
    else this.downloading.delete(id);
  }

  delete(id: string) {
    if (!this.db.get(id)) throw new HttpError(404, 'File not found.');
    this.db.update(id, { status: 'deleting' });
    void this.collect();
  }

  collect(): Promise<void> {
    this.collectAgain = true;
    if (this.collecting) return this.collecting;
    this.collecting = (async () => {
      do {
        this.collectAgain = false;
        await this.sweep();
      } while (this.collectAgain);
    })().finally(() => {
      this.collecting = null;
    });
    return this.collecting;
  }

  private async sweep() {
    for (const file of this.db.garbage()) {
      if (this.scheduled.has(file.id) || this.downloading.has(file.id))
        continue;
      this.db.update(file.id, { status: 'deleting' });
      try {
        if (file.storageKey) await this.storage.remove(file.storageKey);
        await this.removeStaging(file.id);
        this.db.remove(file.id);
      } catch (error) {
        console.error(
          'cleanup failed',
          file.id,
          error instanceof Error ? error.name : 'unknown',
        );
      }
    }
  }

  private async removeStaging(name: string) {
    await unlink(this.path(name)).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }

  async close() {
    clearInterval(this.timer);
    await this.queue.onIdle();
    await this.collect();
    await this.storage.close();
    this.db.close();
  }
}
