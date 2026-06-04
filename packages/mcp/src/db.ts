import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
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

CREATE TABLE IF NOT EXISTS oauth_clients (
  client_id     TEXT PRIMARY KEY,
  redirect_uris TEXT NOT NULL,   -- JSON array of absolute URIs
  client_name   TEXT,
  created_at    INTEGER NOT NULL
);

-- Short-lived, single-use authorization codes (PKCE).
CREATE TABLE IF NOT EXISTS auth_codes (
  code           TEXT PRIMARY KEY,
  subject        TEXT NOT NULL,
  client_id      TEXT NOT NULL,
  redirect_uri   TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  resource       TEXT,
  scope          TEXT,
  expires_at     INTEGER NOT NULL
);

-- Issued refresh tokens (our own), mapping back to a Penca subject.
CREATE TABLE IF NOT EXISTS sessions (
  refresh_token TEXT PRIMARY KEY,
  subject       TEXT NOT NULL,
  client_id     TEXT NOT NULL,
  scope         TEXT,
  created_at    INTEGER NOT NULL,
  last_used_at  INTEGER
);

-- In-flight browser sign-ins between the email step and the magic-link step.
CREATE TABLE IF NOT EXISTS pending_logins (
  login_id       TEXT PRIMARY KEY,
  client_id      TEXT NOT NULL,
  redirect_uri   TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  state          TEXT,
  scope          TEXT,
  resource       TEXT,
  email          TEXT,
  expires_at     INTEGER NOT NULL
);
`;

/**
 * Open (creating if needed) the SQLite database and apply the schema. Defaults
 * to `MCP_DB_PATH` or the container's mounted volume; pass `:memory:` in tests.
 */
export function openDb(path = process.env.MCP_DB_PATH ?? '/data/penca-mcp.db'): Db {
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true });
  }
  const db = new Database(path);
  if (path !== ':memory:') {
    // WAL gives readers/writers concurrency and survives unclean shutdowns.
    db.pragma('journal_mode = WAL');
  }
  db.exec(SCHEMA);
  return db;
}
