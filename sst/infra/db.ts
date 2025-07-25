import { hashElement } from 'folder-hash';
import { VPC } from './vpc';
import { Config } from '../config';

export class DB {
  readonly postgresCredsData;
  readonly postgresCreds;
  readonly dbSecret: aws.secretsmanager.Secret;
  readonly migrate: aws.lambda.Invocation;

  private changeDbUserPasswordFn;

  constructor({ vpc, config }: { vpc: VPC; config: Config }) {
    this.postgresCredsData = {
      host: config.planetscale.host,
      port: config.planetscale.port,
      username: config.planetscale.user,
      password: config.planetscale.password,
      dbname: config.planetscale.database,
      psBranchId: config.planetscale.branchId,
    };

    this.postgresCreds = new sst.Linkable('PostgresCreds', {
      properties: this.postgresCredsData,
    });

    this.dbSecret = new aws.secretsmanager.Secret('DBSecret', {
      name: `/${$app.name}/${$app.stage}/DBSecret`,
    });
    new aws.secretsmanager.SecretVersion('DBSecretVersion', {
      secretId: this.dbSecret.id,
      secretString: JSON.stringify(this.postgresCredsData),
    });

    const migrateFn = new sst.aws.Function('MigrateFunction', {
      handler: 'sst/functions/custom-resources/migrate/index.handler',
      nodejs: {
        install: ['pg'],
      },
      copyFiles: [{ from: 'migrations', to: 'migrations' }],
      timeout: '1 minute',
      link: [this.postgresCreds],
      vpc: vpc.vpc,
    });

    this.migrate = new aws.lambda.Invocation('Migrate', {
      input: $util.output(hashElement('migrations', { files: { include: ['**/*.sql'] } })).hash.apply((hash) => JSON.stringify({ hash })),
      functionName: migrateFn.name,
    });

    this.changeDbUserPasswordFn = new sst.aws.Function('ChangeDBUserPasswordFunction', {
      handler: 'sst/functions/custom-resources/change-db-user-password/index.handler',
      timeout: '10 seconds',
      link: [this.postgresCreds],
      vpc: vpc.vpc,
    });
  }

  genUserPassword(username: string, { noSsl = false }: { noSsl?: boolean } = {}): {
    password: $util.Output<string>;
    secret: aws.secretsmanager.Secret;
  } {
    const secret = new aws.secretsmanager.Secret(`DBUser-${username}-Password`, {
      name: `/${$app.name}/${$app.stage}/DBUser/${username}`,
      description: `Supabase - Database User ${username}`,
    });
    const password = new random.RandomPassword(`DBUser-${username}-Password`, {
      length: 32,
      special: false,
    }).result;
    new aws.secretsmanager.SecretVersion(`DBUser-${username}-PasswordValue`, {
      secretId: secret.id,
      secretString: password.apply((password) => JSON.stringify({
        username,
        password,
        uri: `postgres://${username}.${this.postgresCredsData.psBranchId}:${password}@${this.postgresCredsData.host}:${this.postgresCredsData.port}/${this.postgresCredsData.dbname}${noSsl ? '' : '?sslmode=verify-full'}`,
      })),
    });

    new aws.lambda.Invocation(`ChangeDBUserPassword-${username}`, {
      input: password.apply((password) => JSON.stringify({ username, password })),
      functionName: this.changeDbUserPasswordFn.name,
    }, {
      dependsOn: this.migrate,
    });

    return { password, secret };
  }
}
