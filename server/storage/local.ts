import { createReadStream } from 'node:fs';
import { copyFile, mkdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { Readable } from 'node:stream';
import type { FileStorage } from './types.js';
import type { FileRecord } from '../database.js';

export class LocalStorage implements FileStorage {
  constructor(private directory: string) {}

  async put(path: string, file: FileRecord) {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    await copyFile(path, join(this.directory, file.id));
    return file.id;
  }

  async open(key: string): Promise<Readable> {
    return createReadStream(join(this.directory, key));
  }
  async remove(key: string) {
    await unlink(join(this.directory, key)).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') throw error;
      },
    );
  }
  async close() {}
}
