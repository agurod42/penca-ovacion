import Database from 'better-sqlite3';

/** A connected better-sqlite3 database handle. */
export type Db = Database.Database;

/**
 * Schema for the MCP server's server-side state. Applied idempotently on open.
 *
 * `penca_identities` maps an OAuth subject (the Penca user id) to that user's
 * Penca tokens, so a session survives reconnects instead of living only in
 * memory. The refresh token is stored through a {@link TokenCodec} (encrypted
 * at rest once the encryption sub-step lands). OAuth tables (clients, codes,
 * sessions, pending logins) are added in later sub-steps.
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS penca_identities (
  subject       TEXT PRIMARY KEY,
  access_token  TEXT NOT NULL,
  refresh_token TEXT,
  email         TEXT,
  updated_at    INTEGER NOT NULL
);
`;

/**
 * Open (creating if needed) the SQLite database and apply the schema. Defaults
 * to `MCP_DB_PATH` or the container's mounted volume; pass `:memory:` in tests.
 */
export function openDb(path = process.env.MCP_DB_PATH ?? '/data/penca-mcp.db'): Db {
  const db = new Database(path);
  if (path !== ':memory:') {
    // WAL gives readers/writers concurrency and survives unclean shutdowns.
    db.pragma('journal_mode = WAL');
  }
  db.exec(SCHEMA);
  return db;
}
