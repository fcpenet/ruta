import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

import { z } from 'zod';

const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, keylen: number) => Promise<Buffer>;

const KEY_LEN = 64;
export const SESSION_DAYS = 30;

export const credentialsSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_.]{3,20}$/, 'Username must be 3–20 letters, numbers, _ or .'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
});

/** `scrypt$<salt b64>$<hash b64>`; node's default scrypt cost (N=16384, r=8, p=1). */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, KEY_LEN);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = await scryptAsync(password, Buffer.from(salt, 'base64'), expected.length);
  return timingSafeEqual(actual, expected);
}

/** Hashed against on unknown usernames so login timing doesn't reveal which usernames exist. */
export const DUMMY_HASH = await hashPassword('ruta-dummy-password');

/** Opaque bearer token; only its SHA-256 is stored, so a leaked database can't be replayed. */
export function newSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
