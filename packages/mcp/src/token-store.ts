import type { TokenStore, Tokens } from 'penca-ovacion-sdk';
import type { Db } from './db.js';

/** Reversible transform applied to the refresh token before it is persisted. */
export interface TokenCodec {
  encrypt(plain: string): string;
  decrypt(stored: string): string;
}

/**
 * No-op codec — refresh token stored verbatim. Replaced by an AES-256-GCM codec
 * (key from Infisical) in the encryption sub-step, before this store is wired
 * into the live request path.
 */
export const plainCodec: TokenCodec = {
  encrypt: (s) => s,
  decrypt: (s) => s,
};

interface IdentityRow {
  access_token: string;
  refresh_token: string | null;
}

/**
 * A {@link TokenStore} bound to a single Penca identity (`subject`), persisting
 * to the shared SQLite database. Because the SDK calls `save()` whenever it
 * refreshes, renewed Penca tokens are written back automatically — the whole
 * reason sessions can outlive a single MCP connection. The refresh token passes
 * through {@link TokenCodec} so it can be encrypted at rest.
 */
export class SqliteTokenStore implements TokenStore {
  private readonly selectStmt;
  private readonly upsertStmt;
  private readonly deleteStmt;

  constructor(
    db: Db,
    private readonly subject: string,
    private readonly codec: TokenCodec = plainCodec,
  ) {
    this.selectStmt = db.prepare(
      'SELECT access_token, refresh_token FROM penca_identities WHERE subject = ?',
    );
    // Upsert deliberately leaves `email` untouched on conflict so a token
    // refresh does not clobber the address captured at sign-in.
    this.upsertStmt = db.prepare(
      `INSERT INTO penca_identities (subject, access_token, refresh_token, updated_at)
       VALUES (@subject, @access_token, @refresh_token, @updated_at)
       ON CONFLICT(subject) DO UPDATE SET
         access_token  = excluded.access_token,
         refresh_token = excluded.refresh_token,
         updated_at    = excluded.updated_at`,
    );
    this.deleteStmt = db.prepare('DELETE FROM penca_identities WHERE subject = ?');
  }

  async load(): Promise<Tokens | null> {
    const row = this.selectStmt.get(this.subject) as IdentityRow | undefined;
    if (!row?.access_token) return null;
    return row.refresh_token
      ? { accessToken: row.access_token, refreshToken: this.codec.decrypt(row.refresh_token) }
      : { accessToken: row.access_token };
  }

  async save(tokens: Tokens): Promise<void> {
    this.upsertStmt.run({
      subject: this.subject,
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken ? this.codec.encrypt(tokens.refreshToken) : null,
      updated_at: Date.now(),
    });
  }

  async clear(): Promise<void> {
    this.deleteStmt.run(this.subject);
  }
}
