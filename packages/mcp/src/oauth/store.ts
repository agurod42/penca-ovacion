import { randomBytes } from 'node:crypto';
import type { Db } from '../db.js';

export const AUTH_CODE_TTL_MS = 60_000; // 60s — codes are exchanged immediately
export const PENDING_LOGIN_TTL_MS = 15 * 60_000; // 15min — covers the email round-trip

const newId = (): string => randomBytes(32).toString('base64url');

export interface AuthCode {
  code: string;
  subject: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  resource: string | null;
  scope: string | null;
  expiresAt: number;
}

interface AuthCodeRow {
  code: string;
  subject: string;
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  resource: string | null;
  scope: string | null;
  expires_at: number;
}

/** Single-use, short-lived authorization codes. */
export class AuthCodeStore {
  private readonly insertStmt;
  private readonly selectStmt;
  private readonly deleteStmt;

  constructor(db: Db) {
    this.insertStmt = db.prepare(
      `INSERT INTO auth_codes (code, subject, client_id, redirect_uri, code_challenge, resource, scope, expires_at)
       VALUES (@code, @subject, @client_id, @redirect_uri, @code_challenge, @resource, @scope, @expires_at)`,
    );
    this.selectStmt = db.prepare('SELECT * FROM auth_codes WHERE code = ?');
    this.deleteStmt = db.prepare('DELETE FROM auth_codes WHERE code = ?');
  }

  issue(input: Omit<AuthCode, 'code' | 'expiresAt'>): AuthCode {
    const code: AuthCode = { ...input, code: newId(), expiresAt: Date.now() + AUTH_CODE_TTL_MS };
    this.insertStmt.run({
      code: code.code,
      subject: code.subject,
      client_id: code.clientId,
      redirect_uri: code.redirectUri,
      code_challenge: code.codeChallenge,
      resource: code.resource,
      scope: code.scope,
      expires_at: code.expiresAt,
    });
    return code;
  }

  /** Fetch and delete a code (single use). Returns null if missing or expired. */
  consume(code: string): AuthCode | null {
    const row = this.selectStmt.get(code) as AuthCodeRow | undefined;
    this.deleteStmt.run(code); // always remove — a code is one-shot even if expired
    if (!row || row.expires_at <= Date.now()) return null;
    return {
      code: row.code,
      subject: row.subject,
      clientId: row.client_id,
      redirectUri: row.redirect_uri,
      codeChallenge: row.code_challenge,
      resource: row.resource,
      scope: row.scope,
      expiresAt: row.expires_at,
    };
  }
}

export interface Session {
  refreshToken: string;
  subject: string;
  clientId: string;
  scope: string | null;
}

interface SessionRow {
  refresh_token: string;
  subject: string;
  client_id: string;
  scope: string | null;
}

/** Issued refresh tokens mapping back to a Penca subject. */
export class SessionStore {
  private readonly insertStmt;
  private readonly selectStmt;
  private readonly touchStmt;
  private readonly deleteStmt;
  private readonly deleteForSubjectStmt;

  constructor(db: Db) {
    this.insertStmt = db.prepare(
      `INSERT INTO sessions (refresh_token, subject, client_id, scope, created_at)
       VALUES (@refresh_token, @subject, @client_id, @scope, @created_at)`,
    );
    this.selectStmt = db.prepare('SELECT * FROM sessions WHERE refresh_token = ?');
    this.touchStmt = db.prepare('UPDATE sessions SET last_used_at = ? WHERE refresh_token = ?');
    this.deleteStmt = db.prepare('DELETE FROM sessions WHERE refresh_token = ?');
    this.deleteForSubjectStmt = db.prepare('DELETE FROM sessions WHERE subject = ?');
  }

  create(input: Session): void {
    this.insertStmt.run({
      refresh_token: input.refreshToken,
      subject: input.subject,
      client_id: input.clientId,
      scope: input.scope,
      created_at: Date.now(),
    });
  }

  get(refreshToken: string): Session | null {
    const row = this.selectStmt.get(refreshToken) as SessionRow | undefined;
    if (!row) return null;
    return {
      refreshToken: row.refresh_token,
      subject: row.subject,
      clientId: row.client_id,
      scope: row.scope,
    };
  }

  touch(refreshToken: string): void {
    this.touchStmt.run(Date.now(), refreshToken);
  }

  delete(refreshToken: string): void {
    this.deleteStmt.run(refreshToken);
  }

  /** Revoke every session for a subject (logout). */
  deleteForSubject(subject: string): void {
    this.deleteForSubjectStmt.run(subject);
  }
}

export interface PendingLogin {
  loginId: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state: string | null;
  scope: string | null;
  resource: string | null;
  email: string | null;
  expiresAt: number;
}

interface PendingLoginRow {
  login_id: string;
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  state: string | null;
  scope: string | null;
  resource: string | null;
  email: string | null;
  expires_at: number;
}

/** Carries the OAuth params across the two-step browser sign-in. */
export class PendingLoginStore {
  private readonly insertStmt;
  private readonly selectStmt;
  private readonly setEmailStmt;
  private readonly deleteStmt;

  constructor(db: Db) {
    this.insertStmt = db.prepare(
      `INSERT INTO pending_logins (login_id, client_id, redirect_uri, code_challenge, state, scope, resource, expires_at)
       VALUES (@login_id, @client_id, @redirect_uri, @code_challenge, @state, @scope, @resource, @expires_at)`,
    );
    this.selectStmt = db.prepare('SELECT * FROM pending_logins WHERE login_id = ?');
    this.setEmailStmt = db.prepare('UPDATE pending_logins SET email = ? WHERE login_id = ?');
    this.deleteStmt = db.prepare('DELETE FROM pending_logins WHERE login_id = ?');
  }

  create(input: Omit<PendingLogin, 'loginId' | 'email' | 'expiresAt'>): PendingLogin {
    const login: PendingLogin = {
      ...input,
      loginId: newId(),
      email: null,
      expiresAt: Date.now() + PENDING_LOGIN_TTL_MS,
    };
    this.insertStmt.run({
      login_id: login.loginId,
      client_id: login.clientId,
      redirect_uri: login.redirectUri,
      code_challenge: login.codeChallenge,
      state: login.state,
      scope: login.scope,
      resource: login.resource,
      expires_at: login.expiresAt,
    });
    return login;
  }

  get(loginId: string): PendingLogin | null {
    const row = this.selectStmt.get(loginId) as PendingLoginRow | undefined;
    if (!row || row.expires_at <= Date.now()) return null;
    return {
      loginId: row.login_id,
      clientId: row.client_id,
      redirectUri: row.redirect_uri,
      codeChallenge: row.code_challenge,
      state: row.state,
      scope: row.scope,
      resource: row.resource,
      email: row.email,
      expiresAt: row.expires_at,
    };
  }

  setEmail(loginId: string, email: string): void {
    this.setEmailStmt.run(email, loginId);
  }

  delete(loginId: string): void {
    this.deleteStmt.run(loginId);
  }
}

/** Record the email captured at sign-in on the identity row (best effort). */
export function setIdentityEmail(db: Db, subject: string, email: string): void {
  db.prepare('UPDATE penca_identities SET email = ? WHERE subject = ?').run(email, subject);
}

/** Read the profile traits stored for a subject (today just the email). */
export function getIdentity(db: Db, subject: string): { email: string | null } | undefined {
  const row = db.prepare('SELECT email FROM penca_identities WHERE subject = ?').get(subject) as
    | { email: string | null }
    | undefined;
  return row ? { email: row.email } : undefined;
}

/** Whether an identity row already exists for a subject (returning vs new user). */
export function identityExists(db: Db, subject: string): boolean {
  return db.prepare('SELECT 1 FROM penca_identities WHERE subject = ?').get(subject) !== undefined;
}
