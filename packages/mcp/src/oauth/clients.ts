import { randomBytes } from 'node:crypto';
import type { Db } from '../db.js';

/** A dynamically registered OAuth client (RFC 7591). Public — no secret. */
export interface OAuthClient {
  clientId: string;
  redirectUris: string[];
  clientName?: string;
  /** Epoch milliseconds. */
  createdAt: number;
}

interface ClientRow {
  client_id: string;
  redirect_uris: string;
  client_name: string | null;
  created_at: number;
}

/** SQLite-backed registry of dynamically registered OAuth clients. */
export class ClientStore {
  private readonly insertStmt;
  private readonly selectStmt;

  constructor(db: Db) {
    this.insertStmt = db.prepare(
      `INSERT INTO oauth_clients (client_id, redirect_uris, client_name, created_at)
       VALUES (@client_id, @redirect_uris, @client_name, @created_at)`,
    );
    this.selectStmt = db.prepare('SELECT * FROM oauth_clients WHERE client_id = ?');
  }

  register(input: { redirectUris: string[]; clientName?: string }): OAuthClient {
    const client: OAuthClient = {
      clientId: randomBytes(16).toString('hex'),
      redirectUris: input.redirectUris,
      clientName: input.clientName,
      createdAt: Date.now(),
    };
    this.insertStmt.run({
      client_id: client.clientId,
      redirect_uris: JSON.stringify(client.redirectUris),
      client_name: client.clientName ?? null,
      created_at: client.createdAt,
    });
    return client;
  }

  get(clientId: string): OAuthClient | null {
    const row = this.selectStmt.get(clientId) as ClientRow | undefined;
    if (!row) return null;
    return {
      clientId: row.client_id,
      redirectUris: JSON.parse(row.redirect_uris) as string[],
      clientName: row.client_name ?? undefined,
      createdAt: row.created_at,
    };
  }
}
