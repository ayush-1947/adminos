import { z } from 'zod';
import type { Resource } from './catalog';
export function inputSchema(r: Resource, partial = false) {
  const shape: Record<string, z.ZodType> = {};
  for (const f of r.fields) {
    let v: z.ZodType;
    switch (f.type) {
      case 'number':
        v = z.coerce
          .number()
          .finite()
          .min(f.min ?? 0)
          .max(
            f.key === 'latitude'
              ? 90
              : f.key === 'longitude'
                ? 180
                : ['startMinute', 'endMinute'].includes(f.key)
                  ? 1439
                  : 1e12,
          );
        break;
      case 'date':
        v = z.iso.datetime({ offset: true }).transform((x) => new Date(x));
        break;
      case 'boolean':
        v = z.boolean();
        break;
      case 'relation':
        v = z.uuid();
        break;
      case 'select':
        v = z.enum(f.options as [string, ...string[]]);
        break;
      case 'email':
        v = z.email().max(254);
        break;
      case 'json':
        v = z.record(z.string().max(100), z.union([z.boolean(), z.string().max(1000)]));
        break;
      default:
        v = z
          .string()
          .trim()
          .min(f.required ? 1 : 0)
          .max(f.type === 'textarea' ? 5000 : 250);
    }
    if (!f.required) v = v.nullable().optional();
    if (partial) v = v.optional();
    shape[f.key] = v;
  }
  return z.strictObject(shape);
}
