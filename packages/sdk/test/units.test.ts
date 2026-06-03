import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  FileTokenStore,
  MemoryTokenStore,
  collect,
  decodeJwt,
  extractMagicToken,
  extractTokens,
  isExpired,
  paginate,
} from '../src/index.js';
import { fakeJwt } from './fixtures.js';

describe('extractTokens', () => {
  it('handles accessToken/refreshToken', () => {
    expect(extractTokens({ accessToken: 'a', refreshToken: 'b' })).toEqual({
      accessToken: 'a',
      refreshToken: 'b',
    });
  });
  it('handles token alias and nested data', () => {
    expect(extractTokens({ data: { token: 'a' } })).toEqual({ accessToken: 'a' });
  });
  it('handles snake_case', () => {
    expect(extractTokens({ access_token: 'a', refresh_token: 'b' })).toEqual({
      accessToken: 'a',
      refreshToken: 'b',
    });
  });
  it('returns null when no token present', () => {
    expect(extractTokens({ foo: 'bar' })).toBeNull();
    expect(extractTokens(null)).toBeNull();
  });
});

describe('extractMagicToken', () => {
  const hex = 'a'.repeat(128);
  it('returns a raw token unchanged', () => {
    expect(extractMagicToken(`  ${hex}  `)).toBe(hex);
  });
  it('extracts the token query param from a link', () => {
    expect(extractMagicToken(`https://penca.example/magic?token=${hex}&x=1`)).toBe(hex);
  });
  it('extracts a hex token embedded in a path', () => {
    expect(extractMagicToken(`https://penca.example/auth/${hex}`)).toBe(hex);
  });
});

describe('jwt', () => {
  it('decodes payload', () => {
    const payload = decodeJwt(fakeJwt);
    expect(payload?.email).toBe('test@example.test');
    expect(payload?.sub).toBe(12345678);
  });
  it('detects expiry', () => {
    expect(isExpired(fakeJwt)).toBe(false); // exp far in the future
  });
});

describe('paginate', () => {
  it('stops on hasMore=false', async () => {
    const pages = [
      { data: [1, 2], hasMore: true },
      { data: [3], hasMore: false },
    ];
    const out = await collect(paginate((p) => Promise.resolve(pages[p - 1]!), { limit: 2 }));
    expect(out).toEqual([1, 2, 3]);
  });
  it('stops on short page when hasMore absent', async () => {
    const pages = [{ data: [1, 2] }, { data: [3] }];
    const out = await collect(paginate((p) => Promise.resolve(pages[p - 1]!), { limit: 2 }));
    expect(out).toEqual([1, 2, 3]);
  });
});

describe('token stores', () => {
  const dir = mkdtemp(join(tmpdir(), 'penca-test-'));
  afterAll(async () => {
    await rm(await dir, { recursive: true, force: true });
  });

  it('MemoryTokenStore round-trips', async () => {
    const s = new MemoryTokenStore();
    expect(await s.load()).toBeNull();
    await s.save({ accessToken: 'a' });
    expect(await s.load()).toEqual({ accessToken: 'a' });
    await s.clear();
    expect(await s.load()).toBeNull();
  });

  it('FileTokenStore round-trips', async () => {
    const s = new FileTokenStore(join(await dir, 'tokens.json'));
    await s.save({ accessToken: 'a', refreshToken: 'b' });
    expect(await s.load()).toEqual({ accessToken: 'a', refreshToken: 'b' });
    await s.clear();
    expect(await s.load()).toBeNull();
  });
});
