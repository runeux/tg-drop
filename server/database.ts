import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { and, desc, eq, inArray, isNotNull, lt, or } from 'drizzle-orm';
import { join } from 'node:path';
import type { DropFile, Expiration } from '../shared/files.js';

const files = sqliteTable('files', {
  id: text().primaryKey(),
  name: text().notNull(),
  size: integer().notNull(),
  mime: text().notNull(),
  code: text().notNull().unique(),
  expiration: text().$type<Expiration>().notNull(),
  expiresAt: integer(),
  createdAt: integer().notNull(),
  status: text().$type<DropFile['status'] | 'deleting'>().notNull(),
  storageKey: text(),
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
      mime TEXT NOT NULL, code TEXT NOT NULL UNIQUE, expiration TEXT NOT NULL,
      expiresAt INTEGER, createdAt INTEGER NOT NULL, status TEXT NOT NULL,
      storageKey TEXT
    ); CREATE INDEX IF NOT EXISTS files_expiry ON files(expiresAt);`);
    this.db = drizzle(this.sqlite);
    this.db
      .update(files)
      .set({ status: 'queued' })
      .where(eq(files.status, 'storing'))
      .run();
  }

  insert(file: FileRecord) {
    this.db.insert(files).values(file).run();
  }
  get(id: string) {
    return this.db.select().from(files).where(eq(files.id, id)).get();
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
    values: Partial<Pick<FileRecord, 'status' | 'storageKey' | 'expiresAt'>>,
  ) {
    this.db.update(files).set(values).where(eq(files.id, id)).run();
  }
  garbage() {
    return this.db
      .select()
      .from(files)
      .where(
        or(
          eq(files.status, 'deleting'),
          and(isNotNull(files.expiresAt), lt(files.expiresAt, Date.now())),
        ),
      )
      .all();
  }
  remove(id: string) {
    this.db.delete(files).where(eq(files.id, id)).run();
  }
  close() {
    this.sqlite.close();
  }
}
