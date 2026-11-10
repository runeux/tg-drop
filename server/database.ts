import { AuthLimiter } from './auth-limiter.js';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { join } from 'node:path';
import type { DropFile } from '../shared/files.js';
import { generateCode, normalizeGeneratedCode } from './security.js';
import { HttpError } from './errors.js';
import { settingsSchema, type Settings } from '../shared/settings.js';

const files = sqliteTable('files', {
  id: text().primaryKey(),
  name: text().notNull(),
  size: integer().notNull(),
  mime: text().notNull(),
  code: text().notNull().unique(),
  createdAt: integer().notNull(),
  status: text().$type<DropFile['status'] | 'deleting'>().notNull(),
  storageKey: text(),
  sourceId: integer(),
  width: integer(),
  height: integer(),
});

const sessions = sqliteTable('sessions', {
  digest: text().primaryKey(),
});

export type FileRecord = Omit<
  typeof files.$inferSelect,
  'width' | 'height' | 'sourceId'
> & {
  sourceId?: number | null;
  width?: number | null;
  height?: number | null;
};

export class FileDatabase {
  readonly authLimiter: AuthLimiter;
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
    for (const column of ['width', 'height', 'sourceId']) {
      if (
        !this.sqlite
          .prepare('SELECT 1 FROM pragma_table_info(?) WHERE name = ?')
          .get('files', column)
      )
        this.sqlite.exec(`ALTER TABLE files ADD COLUMN ${column} INTEGER`);
    }
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
    this.sqlite.exec(
      'CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK (id = 1), value TEXT NOT NULL)',
    );
    this.authLimiter = new AuthLimiter(this.sqlite);
    this.db = drizzle(this.sqlite);
    this.sqlite
      .transaction(() => {
        // run the old code migration once so later edits survive restarts.
        if (this.sqlite.pragma('user_version', { simple: true }) !== 0) return;
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
          this.db
            .update(files)
            .set({ code })
            .where(eq(files.id, file.id))
            .run();
        }
        this.sqlite.pragma('user_version = 1');
      })
      .immediate();
    this.db
      .update(files)
      .set({ status: 'queued' })
      .where(eq(files.status, 'storing'))
      .run();
  }

  migrateTelegramKeys() {
    // attribute old message-only keys to the channel used before sources existed.
    this.sqlite
      .prepare(
        `
      UPDATE files
      SET sourceId = @source, storageKey = CAST(@source AS INTEGER) || ':' || storageKey
      WHERE sourceId IS NULL AND storageKey <> '' AND storageKey NOT GLOB '*[^0-9]*'
    `,
      )
      .run({ source: -1004304384450 });
  }

  readSettings(): Settings {
    const row = this.sqlite
      .prepare<[], { value: string }>('SELECT value FROM settings WHERE id = 1')
      .get();
    return row
      ? settingsSchema.parse(JSON.parse(row.value))
      : { sources: [], tags: [] };
  }

  saveSettings(settings: Settings) {
    this.sqlite
      .prepare('INSERT OR REPLACE INTO settings (id, value) VALUES (1, ?)')
      .run(JSON.stringify(settings));
  }

  storedInSource(sourceId: number) {
    return this.db
      .select({ id: files.id, key: files.storageKey })
      .from(files)
      .where(
        and(
          eq(files.sourceId, sourceId),
          inArray(files.status, ['ready', 'deleting']),
        ),
      )
      .all();
  }

  pruneMissing(candidates: { id: string; key: string }[]) {
    this.sqlite.transaction(() => {
      for (const { id, key } of candidates) {
        this.db
          .delete(files)
          .where(
            and(
              eq(files.id, id),
              eq(files.storageKey, key),
              eq(files.status, 'ready'),
            ),
          )
          .run();
      }
    })();
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
  changeCode(id: string, code: string) {
    return this.sqlite
      .transaction(() => {
        const file = this.get(id);
        if (!file || file.status !== 'ready')
          throw new HttpError(404, 'File not found.');
        const generated = normalizeGeneratedCode(code);
        const taken = this.db
          .select({ id: files.id })
          .from(files)
          .where(
            inArray(
              files.code,
              generated && generated !== code ? [code, generated] : [code],
            ),
          )
          .all();
        if (taken.some((entry) => entry.id !== id))
          throw new HttpError(409, 'That code is already taken.');
        this.db.update(files).set({ code }).where(eq(files.id, id)).run();
        return file;
      })
      .immediate();
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
    values: Partial<
      Pick<
        FileRecord,
        'status' | 'storageKey' | 'sourceId' | 'width' | 'height'
      >
    >,
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
