import { z } from 'zod';

// bcrypt authenticates only the first 72 UTF-8 bytes. Never silently truncate new credentials.
export const passwordSchema = z
  .string()
  .min(14)
  .max(128)
  .refine(
    (password) => Buffer.byteLength(password, 'utf8') <= 72,
    'Password must be at most 72 UTF-8 bytes',
  );
