import { drizzle } from 'drizzle-orm/node-postgres';
import * as pg from 'pg';
import { Resource } from 'sst';

export const db = drizzle(new pg.Client({
  host: Resource.PostgresCreds.host,
  port: Resource.PostgresCreds.port,
  user: Resource.PostgresCreds.username,
  password: Resource.PostgresCreds.password,
  database: Resource.PostgresCreds.dbname,
  ssl: true,
}));
await db.$client.connect();
