import { describe, expect, it } from 'vitest';
import { openDb } from '../src/db.js';
import { SqliteTokenStore, type TokenCodec } from '../src/token-store.js';

describe('SqliteTokenStore', () => {
  it('round-trips tokens for a subject', async () => {
    const store = new SqliteTokenStore(openDb(':memory:'), 'user-1');
    expect(await store.load()).toBeNull();
    await store.save({ accessToken: 'a1', refreshToken: 'r1' });
    expect(await store.load()).toEqual({ accessToken: 'a1', refreshToken: 'r1' });
  });

  it('stores an access-only token without a refresh token', async () => {
    const store = new SqliteTokenStore(openDb(':memory:'), 'user-1');
    await store.save({ accessToken: 'a1' });
    expect(await store.load()).toEqual({ accessToken: 'a1' });
  });

  it('overwrites on refresh and keeps subjects isolated', async () => {
    const db = openDb(':memory:');
    const a = new SqliteTokenStore(db, 'user-a');
    const b = new SqliteTokenStore(db, 'user-b');
    await a.save({ accessToken: 'a1', refreshToken: 'ra' });
    await b.save({ accessToken: 'b1' });
    await a.save({ accessToken: 'a2', refreshToken: 'ra2' }); // simulated refresh
    expect(await a.load()).toEqual({ accessToken: 'a2', refreshToken: 'ra2' });
    expect(await b.load()).toEqual({ accessToken: 'b1' });
  });

  it('clears a subject', async () => {
    const store = new SqliteTokenStore(openDb(':memory:'), 'user-1');
    await store.save({ accessToken: 'a1', refreshToken: 'r1' });
    await store.clear();
    expect(await store.load()).toBeNull();
  });

  it('applies the codec to the refresh token at rest', async () => {
    const db = openDb(':memory:');
    const codec: TokenCodec = {
      encrypt: (s) => `enc:${s}`,
      decrypt: (s) => s.replace(/^enc:/, ''),
    };
    const store = new SqliteTokenStore(db, 'user-1', codec);
    await store.save({ accessToken: 'a1', refreshToken: 'secret' });
    // Persisted form is encrypted...
    const raw = db
      .prepare('SELECT refresh_token FROM penca_identities WHERE subject = ?')
      .get('user-1') as { refresh_token: string };
    expect(raw.refresh_token).toBe('enc:secret');
    // ...but load() transparently decrypts it.
    expect((await store.load())?.refreshToken).toBe('secret');
  });
});
