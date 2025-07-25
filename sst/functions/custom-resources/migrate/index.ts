import fs from 'fs';
import type { Handler } from 'aws-lambda';
import { sql } from 'drizzle-orm';
import type { MigrationConfig } from 'drizzle-orm/migrator';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { globSync } from 'glob';
import { db } from '../../db';

async function migrate(db: NodePgDatabase, config: MigrationConfig) {
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

  await db.transaction(async (tx) => {
    for (const migration of migrations) {
      if (
        !lastDbMigration
					|| lastDbMigration.name < migration.name
      ) {
        console.log(`Applying migration ${migration.name}`);
        await tx.execute(sql.raw(migration.sql));
        await tx.execute(
          sql`insert into ${sql.identifier(migrationsSchema)}.${
            sql.identifier(migrationsTable)
          } ("name") values(${migration.name})`,
        );
        console.log(`Applied migration ${migration.name}`);
      }
    }
  });
}

export const handler: Handler = async (event) => {
  /** Database connection */
  console.info('Connected to PostgreSQL database');

  await migrate(db, { migrationsFolder: 'migrations/init-scripts', migrationsTable: 'init-scripts-migrations' });
  await migrate(db, { migrationsFolder: 'migrations/migrations', migrationsTable: 'migrations' });

  await db.$client.end();
  return {};
};
