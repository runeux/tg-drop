import type { Readable } from 'node:stream';
import type { FileRecord } from '../database.js';

export interface ByteRange {
  start: number;
  end: number;
}

export interface FileStorage {
  put(
    path: string,
    file: FileRecord,
    progress: (percent: number) => void,
  ): Promise<string>;
  open(key: string, range?: ByteRange): Promise<Readable>;
  remove(key: string): Promise<void>;
  close(): Promise<void>;
}
