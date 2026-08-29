import { createHash, timingSafeEqual } from 'node:crypto';

export const validateScheduledRequestToken = (received?: string): boolean => {
  const expected = process.env.DAILY_SCAN_TOKEN;
  if (!expected || !received) return false;
  const expectedHash = Buffer.from(createHash('sha256').update(expected).digest('hex'));
  const receivedHash = Buffer.from(createHash('sha256').update(received).digest('hex'));
  return expectedHash.length === receivedHash.length && timingSafeEqual(expectedHash, receivedHash);
};
