import { Buffer } from 'node:buffer';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { type TokenCodec, plainCodec } from './token-store.js';

/**
 * AES-256-GCM codec for encrypting the Penca refresh token at rest in SQLite.
 *
 * Stored form is `base64(nonce[12] || ciphertext || tag[16])`. GCM is
 * authenticated, so a tampered or truncated ciphertext fails to decrypt rather
 * than returning garbage. A fresh random nonce per encryption means identical
 * plaintexts produce distinct ciphertexts.
 */

const ALGO = 'aes-256-gcm';
const NONCE_LEN = 12;
const TAG_LEN = 16;

/** Build a codec from a 32-byte key. */
export function createAesGcmCodec(key: Buffer): TokenCodec {
  if (key.length !== 32) {
    throw new Error(`AES-256-GCM requires a 32-byte key, got ${key.length}.`);
  }
  return {
    encrypt(plain) {
      const nonce = randomBytes(NONCE_LEN);
      const cipher = createCipheriv(ALGO, key, nonce);
      const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
      const tag = cipher.getAuthTag();
      return Buffer.concat([nonce, ciphertext, tag]).toString('base64');
    },
    decrypt(stored) {
      const buf = Buffer.from(stored, 'base64');
      if (buf.length < NONCE_LEN + TAG_LEN) {
        throw new Error('Ciphertext too short to contain a nonce and tag.');
      }
      const nonce = buf.subarray(0, NONCE_LEN);
      const ciphertext = buf.subarray(NONCE_LEN, buf.length - TAG_LEN);
      const tag = buf.subarray(buf.length - TAG_LEN);
      const decipher = createDecipheriv(ALGO, key, nonce);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    },
  };
}

/** Parse a 32-byte key from 64 hex chars or base64. */
export function parseEncKey(raw: string): Buffer {
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, 'hex');
  const decoded = Buffer.from(raw, 'base64');
  if (decoded.length === 32) return decoded;
  throw new Error('MCP_TOKEN_ENC_KEY must be 32 bytes (64 hex chars or base64).');
}

/**
 * Resolve the at-rest codec from the environment. With `MCP_TOKEN_ENC_KEY` set,
 * returns the AES-GCM codec; otherwise falls back to {@link plainCodec} and
 * warns — acceptable for local dev, not for the hosted server.
 */
export function codecFromEnv(env: NodeJS.ProcessEnv = process.env): TokenCodec {
  const raw = env.MCP_TOKEN_ENC_KEY;
  if (!raw) {
    console.error(
      'WARNING: MCP_TOKEN_ENC_KEY not set — refresh tokens will be stored UNENCRYPTED at rest.',
    );
    return plainCodec;
  }
  return createAesGcmCodec(parseEncKey(raw));
}
