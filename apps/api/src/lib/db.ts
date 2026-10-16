import { PrismaClient } from '@prisma/client';
export const db = new PrismaClient();
// Dynamic resource access is contained at this repository boundary. All writes are
// validated against the explicit resource schema before reaching this interface.
export type Row = Record<string, any>;
export interface Repository {
  findMany(args?: Row): Promise<Row[]>;
  findFirst(args: Row): Promise<Row | null>;
  count(args?: Row): Promise<number>;
  create(args: Row): Promise<Row>;
  update(args: Row): Promise<Row>;
  updateMany(args: Row): Promise<{ count: number }>;
  aggregate(args: Row): Promise<Row>;
}
export const repository = (model: string, client: unknown = db): Repository =>
  (client as Record<string, Repository>)[model];
