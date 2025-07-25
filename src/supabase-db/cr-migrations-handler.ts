import fs from 'fs';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import type { CdkCustomResourceHandler } from 'aws-lambda';
import { sql } from 'drizzle-orm';
import type { MigrationConfig } from 'drizzle-orm/migrator';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { globSync } from 'glob';
import pg from 'pg';

interface DBSecret {
  engine: string;
  host: string;
  port: string;
  username: string;
  password: string;
  dbname: string;
  ssl: boolean;
};

const dbSecretArn = process.env.DB_SECRET_ARN!;

/** API Client for Secrets Manager */
const secretsManager = new SecretsManagerClient();

/** Get secret from Secrets Manager */
const getSecret = async (secretId: string): Promise<DBSecret> => {
  const cmd = new GetSecretValueCommand({ SecretId: secretId });
  const { SecretString } = await secretsManager.send(cmd);
  const secret = JSON.parse(SecretString!) as DBSecret;
  return secret;
};

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

export const handler: CdkCustomResourceHandler = async (event, _context) => {
  /** The secret used for database connections */
  const dbSecret = await getSecret(dbSecretArn);
  const { host, port, dbname, username, password, ssl } = dbSecret;

  /** Database connection */
  const db = drizzle(
    new pg.Client({
      host,
      port: Number(port),
      user: username,
      password,
      database: dbname || 'postgres',
      ssl: {
        rejectUnauthorized: false,
      },
    }),
    { logger: true },
  );
  await db.$client.connect();
  console.info('Connected to PostgreSQL database');

  switch (event.RequestType) {
    case 'Create':
    case 'Update': {
      await migrate(db, { migrationsFolder: 'migrations/init-scripts', migrationsTable: 'init-scripts-migrations' });
      await migrate(db, { migrationsFolder: 'migrations/migrations', migrationsTable: 'migrations' });
      break;
    }
  };

  await db.$client.end();
  return {};
};
