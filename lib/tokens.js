import { randomBytes, createHash } from 'node:crypto';

/** Token non indovinabile (192 bit), sicuro per gli URL. */
export function newBookingToken() {
  return randomBytes(24).toString('base64url');
}

export const TOKEN_VALIDITY_DAYS = 7;

export function tokenExpiry(from = new Date()) {
  return new Date(from.getTime() + TOKEN_VALIDITY_DAYS * 24 * 60 * 60 * 1000);
}

/** Hash dell'IP con salt: serve solo al rate limit, l'IP in chiaro non viene salvato. */
export function hashIp(ip) {
  const salt = process.env.IP_HASH_SALT || '';
  return createHash('sha256').update(`${salt}:${ip}`).digest('hex').slice(0, 32);
}
