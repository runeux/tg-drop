import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { join } from 'node:path';
import type { DropFile } from '../shared/files.js';
import { generateCode } from './security.js';

const files = sqliteTable('files', {
  id: text().primaryKey(),
  name: text().notNull(),
  size: integer().notNull(),
  mime: text().notNull(),
  code: text().notNull().unique(),
  createdAt: integer().notNull(),
  status: text().$type<DropFile['status'] | 'deleting'>().notNull(),
  storageKey: text(),
});

const sessions = sqliteTable('sessions', {
  digest: text().primaryKey(),
});

export type FileRecord = typeof files.$inferSelect;

export class FileDatabase {
  private sqlite: Database.Database;
  private db;

  constructor(directory: string) {
    this.sqlite = new Database(join(directory, 'files.db'));
    this.sqlite.pragma('journal_mode = WAL');
    this.sqlite.pragma('busy_timeout = 5000');
    this.sqlite.exec(`CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, size INTEGER NOT NULL,
      mime TEXT NOT NULL, code TEXT NOT NULL UNIQUE,
      createdAt INTEGER NOT NULL, status TEXT NOT NULL,
      storageKey TEXT
    );`);
    const legacy = this.sqlite
      .prepare('SELECT 1 FROM pragma_table_info(?) WHERE name = ?')
      .get('files', 'expiration');
    if (legacy) {
      this.sqlite.transaction(() => {
        this.sqlite.exec(
          'DROP INDEX IF EXISTS files_expiry; ALTER TABLE files DROP COLUMN expiration; ALTER TABLE files DROP COLUMN expiresAt;',
        );
      })();
    }
    this.sqlite.exec(
      'CREATE UNIQUE INDEX IF NOT EXISTS files_storage_key ON files(storageKey) WHERE storageKey IS NOT NULL',
    );
    this.sqlite.exec(
      'CREATE TABLE IF NOT EXISTS sessions (digest TEXT PRIMARY KEY)',
    );
    this.db = drizzle(this.sqlite);
    this.sqlite.transaction(() => {
      const existing = this.db
        .select({ id: files.id, code: files.code })
        .from(files)
        .all();
      for (const file of existing) {
        if (file.code.replaceAll('-', '').length === 16) continue;
        let code: string;
        do {
          code = generateCode();
        } while (
          this.db
            .select({ id: files.id })
            .from(files)
            .where(eq(files.code, code))
            .get()
        );
        this.db.update(files).set({ code }).where(eq(files.id, file.id)).run();
      }
    })();
    this.db
      .update(files)
      .set({ status: 'queued' })
      .where(eq(files.status, 'storing'))
      .run();
  }

  createSession(digest: string) {
    this.db.insert(sessions).values({ digest }).run();
  }
  hasSession(digest: string) {
    return Boolean(
      this.db.select().from(sessions).where(eq(sessions.digest, digest)).get(),
    );
  }
  deleteSession(digest: string) {
    this.db.delete(sessions).where(eq(sessions.digest, digest)).run();
  }
  insert(file: FileRecord) {
    this.db.insert(files).values(file).run();
  }
  get(id: string) {
    return this.db.select().from(files).where(eq(files.id, id)).get();
  }
  byStorageKey(key: string) {
    return this.db.select().from(files).where(eq(files.storageKey, key)).get();
  }
  byCode(code: string) {
    return this.db
      .select()
      .from(files)
      .where(and(eq(files.code, code), eq(files.status, 'ready')))
      .get();
  }
  list() {
    return this.db
      .select()
      .from(files)
      .where(inArray(files.status, ['queued', 'storing', 'ready', 'failed']))
      .orderBy(desc(files.createdAt))
      .all();
  }
  pending() {
    return this.db.select().from(files).where(eq(files.status, 'queued')).all();
  }
  update(
    id: string,
    values: Partial<Pick<FileRecord, 'status' | 'storageKey'>>,
  ) {
    this.db.update(files).set(values).where(eq(files.id, id)).run();
  }
  garbage() {
    return this.db
      .select()
      .from(files)
      .where(eq(files.status, 'deleting'))
      .all();
  }
  remove(id: string) {
    this.db.delete(files).where(eq(files.id, id)).run();
  }
  close() {
    this.sqlite.close();
  }
}
