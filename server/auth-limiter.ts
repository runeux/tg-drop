import type Database from 'better-sqlite3';
import ipaddr from 'ipaddr.js';
import PQueue from 'p-queue';
import { RateLimiterSQLite } from 'rate-limiter-flexible';
import { HttpError } from './errors.js';

export function clientNetwork(address: string) {
  if (!ipaddr.isValid(address)) return 'unknown';
  const parsed = ipaddr.process(address);
  if (parsed.kind() === 'ipv4') return parsed.toString();
  return parsed.toByteArray().slice(0, 8).join(':') + '/64';
}

export class AuthLimiter {
  private queue = new PQueue({ concurrency: 1 });
  private personal: RateLimiterSQLite;
  private global: RateLimiterSQLite;

  constructor(private sqlite: Database.Database) {
    sqlite.exec(`CREATE TABLE IF NOT EXISTS auth_limits (
      key TEXT PRIMARY KEY, points INTEGER NOT NULL DEFAULT 0, expire INTEGER
    )`);
    const options = {
      storeClient: sqlite,
      storeType: 'better-sqlite3',
      tableName: 'auth_limits',
      tableCreated: true,
      clearExpiredByTimeout: false,
      duration: 60,
    };
    this.personal = new RateLimiterSQLite({
      ...options,
      keyPrefix: 'ip',
      points: 3,
    });
    this.global = new RateLimiterSQLite({
      ...options,
      keyPrefix: 'global',
      points: 10,
    });
  }

  async run(address: string, attempt: () => Promise<boolean>) {
    if (this.queue.size >= 16)
      throw new HttpError(503, 'Too many pending attempts. Try again shortly.');
    await this.queue.add(async () => {
      try {
        this.sqlite
          .prepare('DELETE FROM auth_limits WHERE expire <= ?')
          .run(Date.now());
        const key = clientNetwork(address);
        const budgets = [
          [this.personal, key, 3],
          [this.global, 'all', 10],
        ] as const;
        for (const [limiter, subject, limit] of budgets) {
          const state = await limiter.get(subject);
          if (state && state.consumedPoints >= limit)
            this.blocked(state.msBeforeNext);
        }
        if (await attempt()) return;
        let wait = 0;
        for (const [limiter, subject, limit] of budgets) {
          const state = await limiter.consume(subject);
          if (state.consumedPoints === limit) {
            await limiter.block(subject, 60);
            wait = 60_000;
          }
        }
        if (wait) this.blocked(wait);
      } catch (error) {
        if (error instanceof HttpError) throw error;
        throw new HttpError(
          503,
          'Unable to check attempts. Try again shortly.',
        );
      }
    });
  }

  private blocked(milliseconds: number): never {
    const seconds = Math.max(1, Math.ceil(milliseconds / 1000));
    throw new HttpError(
      429,
      `Too many incorrect attempts. Try again in ${seconds} seconds.`,
      seconds,
    );
  }
}
