import { SecretsManagerClient, GetSecretValueCommand, PutSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { CdkCustomResourceHandler } from 'aws-lambda';
import { sql } from 'drizzle-orm';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';

interface dbSecret {
  engine: string;
  host: string;
  port: string;
  username: string;
  password: string;
  dbname: string;
  psBranchId: string;
};

const dbSecretArn = process.env.DB_SECRET_ARN!;

/** API Client for Secrets Manager */
const secretsManager = new SecretsManagerClient();

/** Get secret from Secrets Manager */
const getSecret = async (secretId: string): Promise<dbSecret> => {
  const cmd = new GetSecretValueCommand({ SecretId: secretId });
  const { SecretString } = await secretsManager.send(cmd);
  const secret = JSON.parse(SecretString!) as dbSecret;
  return secret;
};

/** Put secret to Secrets Manager */
const putSecret = async (secretId: string, SecretValue: object) => {
  const cmd = new PutSecretValueCommand({ SecretId: secretId, SecretString: JSON.stringify(SecretValue) });
  await secretsManager.send(cmd);
};

/** Set password */
const setUserPassword = async (db: NodePgDatabase, username: string, password: string) => {
  await db.execute(sql`alter user ${sql.raw(username)} with password '${sql.raw(password)}'`);
};

export const handler: CdkCustomResourceHandler = async (event, _context) => {
  /** The name of user to be created or droped */
  const username: string = event.ResourceProperties.Username;
  /** The secret of user to be created */
  const secretId: string = event.ResourceProperties.SecretId;

  /** The secret used for database connections */
  const dbSecret = await getSecret(dbSecretArn);
  const { host, port, dbname, username: rootUsername, password: rootPassword } = dbSecret;

  /** Database connection */
  const db = drizzle(
    new pg.Client({
      host,
      port: Number(port),
      user: rootUsername,
      password: rootPassword,
      database: dbname,
      ssl: {
        rejectUnauthorized: false,
      },
    }),
  );
  await db.$client.connect();
  console.log('Connected to PostgreSQL database');

  let physicalResourceId: string | undefined;

  switch (event.RequestType) {
    case 'Create':
    case 'Update': {
      const { password } = await getSecret(secretId);
      await setUserPassword(db, username, password);
      const connectionUsername = `${username}.${dbSecret.psBranchId}`;
      await putSecret(secretId, {
        ...dbSecret,
        username: connectionUsername,
        password,
        uri: `postgres://${connectionUsername}:${password}@${host}:${port}/${dbname}?sslmode=verify-full`,
      });
      physicalResourceId = `${username}@${dbSecret.host}`;
      break;
    }
    case 'Delete': {
      break;
    }
  };

  await db.$client.end();
  return { PhysicalResourceId: physicalResourceId };
};
