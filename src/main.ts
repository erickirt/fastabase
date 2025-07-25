import 'dotenv/config';

import {
  SecretsManagerClient,
  CreateSecretCommand,
  PutSecretValueCommand,
  DescribeSecretCommand,
} from '@aws-sdk/client-secrets-manager';
import { App } from 'aws-cdk-lib';
import { parseEnv, z } from 'znv';
import { SupabaseDatabase } from './supabase-db';
import { SupabaseStack } from './supabase-stack';
import { SupabaseVPC } from './supabase-vpc';
import { SupabaseWafStack } from './supabase-waf-stack';


async function main() {
  let dbSecretArn: string;
  {
    const env = parseEnv(process.env, {
      POSTGRES_HOST: z.string().min(1),
      POSTGRES_PORT: z.number(),
      POSTGRES_USER: z.string().min(1),
      POSTGRES_PASSWORD: z.string().min(1),
      POSTGRES_DB: z.string().min(1),
      POSTGRES_SECRET_NAME: z.string().optional(),
      PLANETSCALE_BRANCH_ID: z.string().min(1),
    });

    const client = new SecretsManagerClient();

    const secretName = env.POSTGRES_SECRET_NAME || `/Supabase/user/${env.POSTGRES_USER}`;
    const secretValue = JSON.stringify({
      host: env.POSTGRES_HOST,
      port: env.POSTGRES_PORT,
      username: env.POSTGRES_USER,
      password: env.POSTGRES_PASSWORD,
      dbname: env.POSTGRES_DB,
      psBranchId: env.PLANETSCALE_BRANCH_ID,
    });

    // Upsert secret
    try {
      const secret = await client.send(new DescribeSecretCommand({ SecretId: secretName }));
      dbSecretArn = secret.ARN!;
      // Secret exists, update value
      await client.send(new PutSecretValueCommand({
        SecretId: secretName,
        SecretString: secretValue,
      }));
    } catch (err: any) {
      if (err.name === 'ResourceNotFoundException') {
      // Secret doesn't exist, create it
        const secret = await client.send(new CreateSecretCommand({
          Name: secretName,
          SecretString: secretValue,
        }));
        dbSecretArn = secret.ARN!;
      } else {
        throw err;
      }
    }
  }

  const isCfnPublishing: boolean = typeof process.env.BSS_FILE_ASSET_BUCKET_NAME != 'undefined';

  const env = (isCfnPublishing)
    ? undefined
    : { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION };

  const app = new App();

  const vpcStack = new SupabaseVPC(app, 'SupabaseVPC', { env });

  new SupabaseWafStack(app, 'SupabaseWaf', { env: { region: 'us-east-1' } });

  /** PostgreSQL Database with Secrets */
  const db = new SupabaseDatabase(app, 'SupabaseDB', {
    env,
    vpc: vpcStack.vpc,
    dbSecretArn,
  });

  new SupabaseStack(app, 'Supabase', {
    env,
    dbSecretArn,
    vpc: vpcStack.vpc,
    db,
  });

  app.synth();
}

main().catch(e => console.error(e));
