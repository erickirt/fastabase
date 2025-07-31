import { drizzle } from 'drizzle-orm/node-postgres';
import * as pg from 'pg';
import { Resource } from 'sst';

export async function createDB({ database = Resource.PostgresCreds.dbname }: { database?: string } = {}) {
  const db = drizzle(new pg.Client({
    host: Resource.PostgresCreds.host,
    port: Resource.PostgresCreds.port,
    user: Resource.PostgresCreds.username,
    password: Resource.PostgresCreds.password,
    database,
    ssl: true,
  }));
  await db.$client.connect();
  return db;
}
