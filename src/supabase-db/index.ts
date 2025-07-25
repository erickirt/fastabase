import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as cr from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';

interface SupabaseDatabaseProps {
  vpc: ec2.IVpc;
  // dbSg: ec2.ISecurityGroup;
  dbSecretArn: string;
}

export class SupabaseDatabase extends cdk.Stack {
  /** Database migration */
  migration: cdk.CustomResource;

  /** Custom resource provider to generate user password */
  userPasswordProvider: cr.Provider;

  /** PostgreSQL for Supabase */
  constructor(scope: Construct, id: string, props: cdk.StackProps & SupabaseDatabaseProps) {
    super(scope, id, props);

    const { vpc } = props;
    // const vpc = ec2.Vpc.fromLookup(this, 'VPC', { vpcId: 'vpc-022e81b7a5bb3dce6' });

    const dbSecret = secretsmanager.Secret.fromSecretCompleteArn(this, 'SupabaseAdminSecret', props.dbSecretArn);

    /** Custom resource handler for database migration */
    const migrationFunction = new NodejsFunction(this, 'MigrationFunction', {
      description: 'Supabase - Database migration function',
      entry: path.resolve(__dirname, 'cr-migrations-handler.ts'),
      bundling: {
        nodeModules: [
          'pg',
        ],
        commandHooks: {
          beforeInstall: (_inputDir, _outputDir) => {
            return [];
          },
          beforeBundling: (_inputDir, _outputDir) => {
            return [];
          },
          afterBundling: (inputDir, outputDir) => {
            return [
              `cp -r ${inputDir}/migrations ${outputDir}/migrations`,
            ];
          },
        },
      },
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(60),
      environment: {
        DB_SECRET_ARN: dbSecret.secretArn,
      },
      vpc,
      // securityGroups: [props.dbSg],
    });

    // Allow a function to read db secret
    dbSecret.grantRead(migrationFunction);

    /** Custom resource provider for database migration */
    const migrationProvider = new cr.Provider(this, 'MigrationProvider', { onEventHandler: migrationFunction });

    /** Database migration */
    this.migration = new cdk.CustomResource(this, 'Migration', {
      serviceToken: migrationProvider.serviceToken,
      resourceType: 'Custom::DatabaseMigration',
      properties: {
        Fingerprint: cdk.FileSystem.fingerprint(path.resolve('migrations')),
      },
    });

    /** Custom resource handler to modify db user password */
    const userPasswordFunction = new NodejsFunction(this, 'UserPasswordFunction', {
      description: 'Supabase - DB user password function',
      entry: path.resolve(__dirname, 'cr-user-password-handler.ts'),
      bundling: {
        nodeModules: ['pg'],
      },
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(10),
      environment: {
        DB_SECRET_ARN: dbSecret.secretArn,
      },
      initialPolicy: [
        new iam.PolicyStatement({
          actions: [
            'secretsmanager:GetSecretValue',
            'secretsmanager:PutSecretValue',
          ],
          resources: [`arn:aws:secretsmanager:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:secret:Supabase-${id}-*`],
        }),
      ],
      vpc,
    });

    // Allow a function to read db secret
    dbSecret.grantRead(userPasswordFunction);

    this.userPasswordProvider = new cr.Provider(this, 'UserPasswordProvider', {
      providerFunctionName: cdk.PhysicalName.GENERATE_IF_NEEDED,
      onEventHandler: userPasswordFunction,
    });
  }

  /** Generate and set password to database user */
  genUserPassword(stack: Construct, username: string) {
    /** Scope */
    const user = new Construct(stack, username);

    /** User secret */
    const secret = new secretsmanager.Secret(user, 'Secret', {
      secretName: `Supabase-${this.node.id}-${username}`,
      description: `Supabase - Database User ${username}`,
      generateSecretString: {
        excludePunctuation: true,
        secretStringTemplate: JSON.stringify({ username }),
        generateStringKey: 'password',
      },
    });

    /** Modify password job */
    const password = new cdk.CustomResource(user, 'Resource', {
      serviceToken: this.userPasswordProvider.serviceToken,
      resourceType: 'Custom::DatabaseUserPassword',
      properties: {
        Username: username,
        SecretId: secret.secretArn,
      },
    });

    // Wait until the database migration is complete.
    secret.node.addDependency(this.migration.node.defaultChild!);
    password.node.addDependency(this.migration.node.defaultChild!);

    return secret;
  }
}
