import { Pool, QueryResult, QueryResultRow } from 'pg';
import { log } from '@/lib/logging/logger';
import { transactionContext } from './transaction-context';

function positiveInt(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

/**
 * Pool sizing for serverless: every warm function instance holds its own
 * pool, so `max` is per instance, not per deployment. Keep it small and
 * release idle connections quickly so N instances don't pin N*max
 * connections on Postgres.
 */
export function poolConfigFromEnv(
  env: Record<string, string | undefined> = process.env
) {
  return {
    connectionString: env.DATABASE_URL,
    max: positiveInt(env.DB_POOL_MAX, 5),
    idleTimeoutMillis: positiveInt(env.DB_POOL_IDLE_MS, 10_000),
    connectionTimeoutMillis: positiveInt(env.DB_POOL_CONNECT_TIMEOUT_MS, 5_000),
  };
}

const pool = new Pool(poolConfigFromEnv());

// pg already evicts the failed client from the pool. Exiting the process
// here would kill every in-flight request on this instance for one broken
// idle connection, so just record it.
pool.on('error', (err) => {
  log.error('db.idle_client_error', { err });
});

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  const start = Date.now();
  const transaction = transactionContext.getStore();
  if (transaction && !transaction.active) throw new Error('Query attempted after transaction completed');
  const result = await (transaction?.client ?? pool).query<T>(text, params);
  const durationMs = Date.now() - start;

  // `params` is never logged — it carries user data.
  const configured = Number(process.env.SLOW_QUERY_MS);
  const slowQueryMs =
    Number.isFinite(configured) && configured > 0 ? configured : 500;
  if (durationMs > slowQueryMs) {
    log.warn('db.slow_query', {
      sql: text.slice(0, 120),
      durationMs,
      rows: result.rowCount,
    });
  } else if (process.env.NODE_ENV === 'development') {
    log.info('db.query', {
      sql: text.slice(0, 120),
      durationMs,
      rows: result.rowCount,
    });
  }

  return result;
}

export async function getClient() {
  const client = await pool.connect();
  return client;
}

/** All query() calls in work share this client and rollback together. */
export async function transaction<T>(work: () => Promise<T>): Promise<T> {
  const existing = transactionContext.getStore();
  if (existing) {
    if (!existing.active) throw new Error('Transaction already completed');
    return work();
  }
  const client = await pool.connect();
  const context = { client, active: true };
  try {
    await client.query('BEGIN');
    const result = await transactionContext.run(context, work);
    const commit = await client.query('COMMIT');
    if (commit.command !== 'COMMIT') throw new Error('Transaction rolled back after a failed query');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    context.active = false;
    client.release();
  }
}

export default pool;
