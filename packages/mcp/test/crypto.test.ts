import { Buffer } from 'node:buffer';
import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { codecFromEnv, createAesGcmCodec, parseEncKey } from '../src/crypto.js';

const key = randomBytes(32);

describe('createAesGcmCodec', () => {
  it('round-trips a value', () => {
    const codec = createAesGcmCodec(key);
    const token = 'refresh-token-abc.123';
    expect(codec.decrypt(codec.encrypt(token))).toBe(token);
  });

  it('produces distinct ciphertexts for identical plaintext (random nonce)', () => {
    const codec = createAesGcmCodec(key);
    expect(codec.encrypt('same')).not.toBe(codec.encrypt('same'));
  });

  it('rejects a tampered ciphertext', () => {
    const codec = createAesGcmCodec(key);
    const buf = Buffer.from(codec.encrypt('secret'), 'base64');
    buf[buf.length - 1] ^= 0x01; // flip a bit in the auth tag
    expect(() => codec.decrypt(buf.toString('base64'))).toThrow();
  });

  it('fails to decrypt with a different key', () => {
    const enc = createAesGcmCodec(key).encrypt('secret');
    const other = createAesGcmCodec(randomBytes(32));
    expect(() => other.decrypt(enc)).toThrow();
  });

  it('rejects a key of the wrong length', () => {
    expect(() => createAesGcmCodec(randomBytes(16))).toThrow(/32-byte/);
  });
});

describe('parseEncKey', () => {
  it('accepts 64 hex chars', () => {
    expect(parseEncKey(key.toString('hex'))).toHaveLength(32);
  });

  it('accepts base64', () => {
    expect(parseEncKey(key.toString('base64'))).toEqual(key);
  });

  it('rejects a malformed key', () => {
    expect(() => parseEncKey('too-short')).toThrow();
  });
});

describe('codecFromEnv', () => {
  it('uses AES-GCM when the key is present', () => {
    const codec = codecFromEnv({ MCP_TOKEN_ENC_KEY: key.toString('hex') } as NodeJS.ProcessEnv);
    expect(codec.decrypt(codec.encrypt('x'))).toBe('x');
  });

  it('falls back to a passthrough codec when the key is absent', () => {
    const codec = codecFromEnv({} as NodeJS.ProcessEnv);
    expect(codec.encrypt('x')).toBe('x'); // plain codec is identity
  });
});
