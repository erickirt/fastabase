import { Handler } from 'aws-lambda';
import { sql } from 'drizzle-orm';
import { db } from '../../db';

export const handler: Handler<{
  username: string;
  password: string;
}> = async ({ username, password }) => {
  await db.execute(sql`alter user ${sql.raw(username)} with password '${sql.raw(password)}'`);
  await db.$client.end();
};
