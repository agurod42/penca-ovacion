import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import type { Tokens } from './types.js';

/** Persistence backend for authentication tokens. */
export interface TokenStore {
  load(): Promise<Tokens | null>;
  save(tokens: Tokens): Promise<void>;
  clear(): Promise<void>;
}

const SERVICE = 'penca-ovacion';
const ACCOUNT = 'default';

/** Stores tokens in memory only. Useful for tests and one-shot scripts. */
export class MemoryTokenStore implements TokenStore {
  private tokens: Tokens | null;
  constructor(initial: Tokens | null = null) {
    this.tokens = initial;
  }
  async load(): Promise<Tokens | null> {
    return this.tokens;
  }
  async save(tokens: Tokens): Promise<void> {
    this.tokens = tokens;
  }
  async clear(): Promise<void> {
    this.tokens = null;
  }
}

/**
 * Reads tokens from environment variables. Read-only: `save`/`clear` are no-ops.
 * `PENCA_TOKEN` (access) and optional `PENCA_REFRESH_TOKEN`.
 */
export class EnvTokenStore implements TokenStore {
  constructor(
    private env: NodeJS.ProcessEnv = process.env,
    private accessVar = 'PENCA_TOKEN',
    private refreshVar = 'PENCA_REFRESH_TOKEN',
  ) {}
  async load(): Promise<Tokens | null> {
    const accessToken = this.env[this.accessVar];
    if (!accessToken) return null;
    const refreshToken = this.env[this.refreshVar];
    return refreshToken ? { accessToken, refreshToken } : { accessToken };
  }
  async save(): Promise<void> {
    /* environment is read-only */
  }
  async clear(): Promise<void> {
    /* environment is read-only */
  }
}

function defaultConfigPath(): string {
  const base =
    process.env.XDG_CONFIG_HOME ??
    join(homedir(), process.platform === 'win32' ? 'AppData/Roaming' : '.config');
  return join(base, 'penca', 'tokens.json');
}

/** Stores tokens in a JSON file with 0600 permissions. */
export class FileTokenStore implements TokenStore {
  constructor(private filePath: string = defaultConfigPath()) {}
  async load(): Promise<Tokens | null> {
    try {
      const raw = await readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as Tokens;
      return parsed.accessToken ? parsed : null;
    } catch {
      return null;
    }
  }
  async save(tokens: Tokens): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(tokens, null, 2), { mode: 0o600 });
  }
  async clear(): Promise<void> {
    await rm(this.filePath, { force: true });
  }
}

interface KeytarModule {
  getPassword(service: string, account: string): Promise<string | null>;
  setPassword(service: string, account: string, password: string): Promise<void>;
  deletePassword(service: string, account: string): Promise<boolean>;
}

async function loadKeytar(): Promise<KeytarModule | null> {
  try {
    // Optional native dependency; may be absent on Linux/CI.
    const mod = (await import('keytar')) as unknown as { default?: KeytarModule } & KeytarModule;
    return mod.default ?? mod;
  } catch {
    return null;
  }
}

/**
 * Stores tokens in the OS keychain via `keytar`. If keytar cannot be loaded
 * (not installed, headless Linux, etc.) it transparently falls back to a
 * {@link FileTokenStore}.
 */
export class KeychainTokenStore implements TokenStore {
  private fallback: FileTokenStore;
  private keytarPromise: Promise<KeytarModule | null> | undefined;

  constructor(fallback: FileTokenStore = new FileTokenStore()) {
    this.fallback = fallback;
  }

  private keytar(): Promise<KeytarModule | null> {
    this.keytarPromise ??= loadKeytar();
    return this.keytarPromise;
  }

  async load(): Promise<Tokens | null> {
    const keytar = await this.keytar();
    if (!keytar) return this.fallback.load();
    const raw = await keytar.getPassword(SERVICE, ACCOUNT);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as Tokens;
      return parsed.accessToken ? parsed : null;
    } catch {
      return null;
    }
  }

  async save(tokens: Tokens): Promise<void> {
    const keytar = await this.keytar();
    if (!keytar) return this.fallback.save(tokens);
    await keytar.setPassword(SERVICE, ACCOUNT, JSON.stringify(tokens));
  }

  async clear(): Promise<void> {
    const keytar = await this.keytar();
    if (!keytar) return this.fallback.clear();
    await keytar.deletePassword(SERVICE, ACCOUNT);
  }
}

/** The default store used by the CLI and MCP server: keychain with file fallback. */
export function defaultTokenStore(): TokenStore {
  return new KeychainTokenStore();
}
