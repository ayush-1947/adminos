import 'dotenv/config';
import { z } from 'zod';
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  APP_ORIGIN: z.url().default('http://localhost:3000'),
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(48),
  SUPABASE_URL: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_STORAGE_BUCKET: z.string().default('operations-documents'),
});
const result = schema.safeParse(process.env);
if (!result.success) {
  const details = result.error.issues
    .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  throw new Error(
    `Invalid API environment configuration:\n${details}\n` +
      'Set these variables on the API service in Render > Environment, then redeploy. ' +
      'See docs/render-neon.md. Environment variable values are omitted from this error.',
  );
}
export const config = result.data;
if (config.NODE_ENV === 'production' && !config.APP_ORIGIN.startsWith('https://'))
  throw new Error('Production requires HTTPS APP_ORIGIN');
