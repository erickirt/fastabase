import fs from 'fs';
import type { Handler } from 'aws-lambda';
import { sql } from 'drizzle-orm';
import type { MigrationConfig } from 'drizzle-orm/migrator';
import { NodePgDatabase, NodePgQueryResultHKT } from 'drizzle-orm/node-postgres';
import { PgTransaction } from 'drizzle-orm/pg-core';
import { globSync } from 'glob';
import { createDB } from '../../db';

async function migrate(db: NodePgDatabase, config: MigrationConfig, opts: { noTransaction?: boolean } = {}) {
  const migrationsTable = config.migrationsTable ?? '__drizzle_migrations';
  const migrationsSchema = config.migrationsSchema ?? 'drizzle';
  await db.execute(sql`create schema if not exists ${sql.identifier(migrationsSchema)}`);
  await db.execute(sql`
    create table if not exists ${sql.identifier(migrationsSchema)}.${sql.identifier(migrationsTable)} (
      "id" serial primary key,
      "name" text not null
    )
  `);

  const { rows: [lastDbMigration] } = await db.execute<{ name: string }>(
    sql`select "name" from ${sql.identifier(migrationsSchema)}.${
      sql.identifier(migrationsTable)
    } order by "name" desc limit 1`,
  );

  const migrations = globSync(`${config.migrationsFolder}/*.sql`)
    .sort((a, b) => a.localeCompare(b))
    .map((file) => {
      return {
        name: file,
        sql: fs.readFileSync(file, 'utf8'),
      };
    });

  async function run(db: NodePgDatabase | PgTransaction<NodePgQueryResultHKT>) {
    for (const migration of migrations) {
      if (
        !lastDbMigration
					|| lastDbMigration.name < migration.name
      ) {
        console.log(`Applying migration ${migration.name}`);
        await db.execute(sql.raw(migration.sql));
        await db.execute(
          sql`insert into ${sql.identifier(migrationsSchema)}.${
            sql.identifier(migrationsTable)
          } ("name") values(${migration.name})`,
        );
        console.log(`Applied migration ${migration.name}`);
      }
    }
  }
  if (opts.noTransaction) {
    await run(db);
  } else {
    await db.transaction(run);
  }
}

export const handler: Handler = async () => {
  const db = await createDB();

  await migrate(db, { migrationsFolder: 'migrations/init-scripts', migrationsTable: 'init-scripts-migrations' });
  await migrate(db, { migrationsFolder: 'migrations/migrations', migrationsTable: 'migrations' });
  await migrate(db, { migrationsFolder: 'migrations/post-init', migrationsTable: 'post-init-migrations' }, { noTransaction: true });

  const supabaseDb = await createDB({ database: '_supabase' });
  await migrate(supabaseDb, { migrationsFolder: 'migrations/post-init/_supabase', migrationsTable: 'post-init-supabase-migrations' });

  await db.$client.end();
  return {};
};
