import { Pool, QueryResult, QueryResultRow } from 'pg';
import { log } from '@/lib/logging/logger';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on('error', (err) => {
  log.error('db.idle_client_error', { err });
  process.exit(-1);
});

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  const start = Date.now();
  const result = await pool.query<T>(text, params);
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

export default pool;
