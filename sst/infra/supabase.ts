import { CDN } from './cdn';
import type { DB } from './db';
import { JWT } from './jwt';
import { Service } from './service';
import { sesSmtp } from './ses-smtp';
import type { VPC } from './vpc';
import type { Config } from '../config';

export class Supabase {
  apiExternalUrl: $util.Output<string>;
  dashboardUser: string;
  dashboardPassword: $util.Output<string>;
  studio: sst.aws.Nextjs;

  constructor({
    vpc,
    db,
    config,
  }: {
    vpc: VPC;
    db: DB;
    config: Config;
  }) {
    const workMailEnabled = false;
    const redirectUrls = '';

    const authImageUri = 'public.ecr.aws/supabase/gotrue:v2.176.1';
    const restImageUri = 'public.ecr.aws/supabase/postgrest:v12.2.12';
    const realtimeImageUri = 'public.ecr.aws/supabase/realtime:v2.34.47';
    const storageImageUri = 'public.ecr.aws/supabase/storage-api:v1.24.7';
    const imgproxyImageUri = 'public.ecr.aws/supabase/imgproxy:v3.8.0';
    const postgresMetaImageUri = 'public.ecr.aws/supabase/postgres-meta:v0.89.3';

    const region = aws.getRegionOutput().name;

    const cluster = new sst.aws.Cluster('Cluster', {
      vpc: {
        id: vpc.vpc.id,
        securityGroups: vpc.vpc.securityGroups,
        containerSubnets: vpc.vpc.privateSubnets,
        loadBalancerSubnets: vpc.vpc.publicSubnets,
        cloudmapNamespaceId: vpc.vpc.nodes.cloudmapNamespace.id,
        cloudmapNamespaceName: vpc.vpc.nodes.cloudmapNamespace.name,
      },
    });

    const smtp = sesSmtp({
      region,
      email: config.email.senderAddress,
      workMailEnabled,
    });

    const supabaseAuthAdminSecret = db.genUserPassword('supabase_auth_admin');
    const supabaseStorageAdminSecret = db.genUserPassword('supabase_storage_admin');
    const authenticatorSecret = db.genUserPassword('authenticator', { noSsl: true });
    const dashboardUserSecret = db.genUserPassword('dashboard_user');

    const jwt = new JWT();

    /**
 * Anonymous Key
 *
 * This key is safe to use in a browser if you have enabled Row Level Security for your tables and configured policies.
 */
    const anonKey = jwt.genApiKey('AnonKey', { roleName: 'anon', issuer: 'supabase', expiresIn: '10y' });

    /**
 * Service Role Key
 *
 * This key has the ability to bypass Row Level Security. Never share it publicly.
 */
    const serviceRoleKey = jwt.genApiKey('ServiceRoleKey', { roleName: 'service_role', issuer: 'supabase', expiresIn: '10y' });

    /** CloudFront Prefix List */
    const cfPrefixList = aws.ec2.getManagedPrefixListOutput({
      name: 'com.amazonaws.global.cloudfront.origin-facing',
    });

    const loadBalancer = new awsx.lb.ApplicationLoadBalancer('LoadBalancer', {
      subnetIds: vpc.vpc.publicSubnets,
      // Only allow access from CloudFront
      defaultSecurityGroup: {
        args: {
          vpcId: vpc.vpc.id,
          ingress: [{
            protocol: 'tcp',
            fromPort: 80,
            toPort: 80,
            prefixListIds: [cfPrefixList.id],
            description: 'CloudFront',
          }],
          egress: [{
            protocol: '-1',
            fromPort: 0,
            toPort: 0,
            cidrBlocks: ['0.0.0.0/0'],
          }],
        },
      },
      defaultTargetGroup: {
        port: 8000,
        protocol: 'HTTP',
        targetType: 'ip',
        vpcId: vpc.vpc.id,
        healthCheck: {
          port: '8100',
          path: '/status',
          timeout: 2,
          interval: 5,
        },
      },
    });

    const cdn = new CDN({ loadBalancer: loadBalancer.loadBalancer });

    this.apiExternalUrl = $interpolate`https://${cdn.distribution.domainName}`;

    this.dashboardUser = 'admin';
    this.dashboardPassword = new random.RandomPassword('DashboardPassword', {
      length: 32,
    }).result;
    const basicAuth = this.dashboardPassword.apply((password) => Buffer.from(`${this.dashboardUser}:${password}`).toString('base64'));
    new aws.ssm.Parameter('DashboardCredentials', {
      name: `/${$app.name}/${$app.stage}/DashboardCredentials`,
      type: 'SecureString',
      value: this.dashboardPassword.apply((password) => JSON.stringify({
        username: this.dashboardUser,
        password,
      })),
    });

    const supabaseNodeModulesInstall = new command.local.Command('NodeModulesInstall', {
      create: 'pnpm i',
      dir: '../../supabase',
    });

    this.studio = new sst.aws.Nextjs('Studio', {
      path: 'supabase/apps/studio',
      vpc: vpc.vpc,
      environment: {
        STUDIO_PG_META_URL: $interpolate`${this.apiExternalUrl}/pg`,
        SUPABASE_URL: this.apiExternalUrl,
        SUPABASE_PUBLIC_URL: this.apiExternalUrl,
        POSTGRES_PASSWORD: db.postgresCredsData.password,
        SUPABASE_ANON_KEY: anonKey.apiKey,
        SUPABASE_SERVICE_KEY: serviceRoleKey.apiKey,
        AUTH_JWT_SECRET: jwt.jwtSecretValue,
        NEXT_PUBLIC_ENABLE_LOGS: 'true',
        NEXT_ANALYTICS_BACKEND_PROVIDER: 'postgres',
        DEFAULT_ORGANIZATION_NAME: config.dashboard.organizationName,
        DEFAULT_PROJECT_NAME: config.dashboard.projectName,
      },
      edge: {
        viewerRequest: {
          injection: $interpolate`
        if (
          !event.request.headers.authorization ||
          event.request.headers.authorization.value !== "Basic ${basicAuth}"
        ) {
          return {
            statusCode: 401,
            headers: {
              "www-authenticate": { value: "Basic" }
            }
          };
        }
      `,
        },
      },
    }, {
      dependsOn: [supabaseNodeModulesInstall],
    });

    const auth = new Service('Auth', {
      cluster,
      image: authImageUri,
      port: 9999,
      health: {
        command: ['CMD', 'wget', '--no-verbose', '--tries=1', '--spider', 'http://localhost:9999/health'],
        interval: '5 seconds',
        timeout: '5 seconds',
        retries: 3,
      },
      environment: {
        GOTRUE_API_HOST: '0.0.0.0',
        GOTRUE_API_PORT: '9999',
        API_EXTERNAL_URL: this.apiExternalUrl,

        GOTRUE_DB_DRIVER: 'postgres',

        GOTRUE_SITE_URL: this.studio.url,
        GOTRUE_URI_ALLOW_LIST: redirectUrls,
        GOTRUE_DISABLE_SIGNUP: config.auth.disableSignup.toString(),

        GOTRUE_JWT_ADMIN_ROLES: 'service_role',
        GOTRUE_JWT_AUD: 'authenticated',
        GOTRUE_JWT_DEFAULT_GROUP_NAME: 'authenticated',
        GOTRUE_JWT_EXP: config.auth.jwtExpiryLimit.toString(),

        GOTRUE_EXTERNAL_EMAIL_ENABLED: 'true',
        GOTRUE_MAILER_AUTOCONFIRM: 'false',
        //GOTRUE_MAILER_SECURE_EMAIL_CHANGE_ENABLED: 'true',
        //GOTRUE_SMTP_MAX_FREQUENCY: '1s',
        GOTRUE_SMTP_ADMIN_EMAIL: smtp.email,
        GOTRUE_SMTP_HOST: smtp.host,
        GOTRUE_SMTP_PORT: smtp.port.toString(),
        GOTRUE_SMTP_SENDER_NAME: config.email.senderName,
        GOTRUE_MAILER_URLPATHS_INVITE: '/auth/v1/verify',
        GOTRUE_MAILER_URLPATHS_CONFIRMATION: '/auth/v1/verify',
        GOTRUE_MAILER_URLPATHS_RECOVERY: '/auth/v1/verify',
        GOTRUE_MAILER_URLPATHS_EMAIL_CHANGE: '/auth/v1/verify',

        GOTRUE_EXTERNAL_PHONE_ENABLED: 'false', // Amazon SNS not supported
        GOTRUE_SMS_AUTOCONFIRM: 'true',

        GOTRUE_RATE_LIMIT_EMAIL_SENT: '3600', // SES Limit: 1msg/s
        GOTRUE_PASSWORD_MIN_LENGTH: config.auth.passwordMinLength.toString(),

        //GOTRUE_TRACING_ENABLED: 'true',
        //OTEL_SERVICE_NAME: 'gotrue',
        //OTEL_EXPORTER_OTLP_PROTOCOL: 'grpc',
        //OTEL_EXPORTER_OTLP_ENDPOINT: `http://${jaeger.dnsName}:4317`,
      },
      ssm: {
        GOTRUE_DB_DATABASE_URL: $interpolate`${supabaseAuthAdminSecret.secret.arn}:uri::`,
        GOTRUE_JWT_SECRET: jwt.jwtSecret.arn,
        GOTRUE_SMTP_USER: $interpolate`${smtp.secret.arn}:username::`,
        GOTRUE_SMTP_PASS: $interpolate`${smtp.secret.arn}:password::`,
      },
    });

    const rest = new Service('Rest', {
      cluster,
      image: restImageUri,
      port: 3000,
      environment: {
        PGRST_DB_SCHEMAS: 'public,storage,graphql_public',
        PGRST_DB_ANON_ROLE: 'anon',
        PGRST_DB_USE_LEGACY_GUCS: 'false',
        PGRST_APP_SETTINGS_JWT_EXP: config.auth.jwtExpiryLimit.toString(),
      },
      ssm: {
        PGRST_DB_URI: $interpolate`${authenticatorSecret.secret.arn}:uri::`,
        PGRST_JWT_SECRET: jwt.jwtSecret.arn,
        PGRST_APP_SETTINGS_JWT_SECRET: jwt.jwtSecret.arn,
      },
    });

    const cookieSigningSecretValue = new random.RandomPassword('CookieSigningSecretValue', {
      length: 64,
      special: false,
    }).result;
    const cookieSigningSecret = new aws.secretsmanager.Secret('CookieSigningSecret', {
      name: `/${$app.name}/${$app.stage}/CookieSigningSecret`,
      description: 'Supabase - Cookie Signing Secret for Realtime',
    });
    new aws.secretsmanager.SecretVersion('CookieSigningSecretVersion', {
      secretId: cookieSigningSecret.id,
      secretString: cookieSigningSecretValue,
    });

    const storageBucket = new sst.aws.Bucket('StorageBucket');
    new aws.s3.BucketServerSideEncryptionConfigurationV2('StorageBucketEncryption', {
      bucket: storageBucket.name,
      rules: [{
        applyServerSideEncryptionByDefault: {
          sseAlgorithm: 'AES256',
        },
      }],
    });

    const imgproxy = new Service('Imgproxy', {
      cluster,
      image: imgproxyImageUri,
      port: 5001,
      health: {
        command: ['CMD', 'imgproxy', 'health'],
        interval: '5 seconds',
        timeout: '5 seconds',
        retries: 3,
      },
      environment: {
        IMGPROXY_BIND: ':5001',
        IMGPROXY_LOCAL_FILESYSTEM_ROOT: '/',
        IMGPROXY_USE_ETAG: 'true',
        IMGPROXY_ENABLE_WEBP_DETECTION: 'true',
      },
    });

    const storage = new Service('Storage', {
      cluster,
      image: storageImageUri,
      port: 5000,
      health: {
        command: ['CMD', 'wget', '--no-verbose', '--tries=1', '--spider', 'http://localhost:5000/status'],
        interval: '5 seconds',
        timeout: '5 seconds',
        retries: 3,
      },
      link: [storageBucket],
      environment: {
        POSTGREST_URL: rest.endpoint,
        PGOPTIONS: '-c search_path=storage,public',
        FILE_SIZE_LIMIT: '52428800',
        STORAGE_BACKEND: 's3',
        TENANT_ID: 'stub',
        IS_MULTITENANT: 'false',
        REGION: region,
        GLOBAL_S3_BUCKET: storageBucket.name,
        ENABLE_IMAGE_TRANSFORMATION: 'true',
        IMGPROXY_URL: imgproxy.endpoint,
        // Smart CDN Caching
        WEBHOOK_URL: cdn.cacheManager.url,
        ENABLE_QUEUE_EVENTS: 'false',
      },
      ssm: {
        ANON_KEY: anonKey.ssmParameter.arn,
        SERVICE_KEY: serviceRoleKey.ssmParameter.arn,
        PGRST_JWT_SECRET: jwt.jwtSecret.arn,
        DATABASE_URL: $interpolate`${supabaseStorageAdminSecret.secret.arn}:uri::`,
        WEBHOOK_API_KEY: cdn.cacheManager.apiKey.arn,
      },
    });

    const meta = new Service('Meta', {
      cluster,
      image: postgresMetaImageUri,
      port: 8080,
      environment: {
        PG_META_PORT: '8080',
        PG_META_DB_SSL_MODE: 'require',
      },
      ssm: {
        PG_META_DB_HOST: $interpolate`${db.dbSecret.arn}:host::`,
        PG_META_DB_PORT: $interpolate`${db.dbSecret.arn}:port::`,
        PG_META_DB_NAME: $interpolate`${db.dbSecret.arn}:dbname::`,
        PG_META_DB_USER: $interpolate`${db.dbSecret.arn}:username::`,
        PG_META_DB_PASSWORD: $interpolate`${db.dbSecret.arn}:password::`,
      },
    }, {
      dependsOn: [db.migrate],
    });

    // Only allow access to Kong from the load balancer
    const kongSecurityGroup = new aws.ec2.SecurityGroup('KongSecurityGroup', {
      vpcId: vpc.vpc.id,
      ingress: [
        {
          protocol: 'tcp',
          fromPort: 8000,
          toPort: 8000,
          securityGroups: [loadBalancer.defaultSecurityGroup.apply((sg) => sg!.id)],
          description: 'Kong',
        },
        {
          protocol: 'tcp',
          fromPort: 8100,
          toPort: 8100,
          securityGroups: [loadBalancer.defaultSecurityGroup.apply((sg) => sg!.id)],
          description: 'Health check',
        },
      ],
      egress: [{
        protocol: '-1',
        fromPort: 0,
        toPort: 0,
        cidrBlocks: ['0.0.0.0/0'],
      }],
    });

    const kong = new Service('Kong', {
      cluster,
      image: {
        context: 'containers/kong',
        args: {
          TARGETPLATFORM: 'linux/arm64',
        },
      },
      port: 8000,
      additionalPorts: [8100],
      health: {
        command: ['CMD', 'kong', 'health'],
        interval: '5 seconds',
        timeout: '5 seconds',
        retries: 3,
      },
      environment: {
        KONG_DNS_ORDER: 'LAST,A,CNAME',
        KONG_PLUGINS: 'request-transformer,cors,key-auth,acl,basic-auth,opentelemetry',
        KONG_NGINX_PROXY_PROXY_BUFFER_SIZE: '160k',
        KONG_NGINX_PROXY_PROXY_BUFFERS: '64 160k',
        // for HealthCheck
        KONG_STATUS_LISTEN: '0.0.0.0:8100',
        // for OpenTelemetry
        //KONG_OPENTELEMETRY_ENABLED: 'true',
        //KONG_OPENTELEMETRY_TRACING: 'all',
        //KONG_OPENTELEMETRY_TRACING_SAMPLING_RATE: '1.0',

        SUPABASE_AUTH_URL: auth.endpoint,
        SUPABASE_REST_URL: rest.endpoint,
        SUPABASE_STORAGE_URL: storage.endpoint,
        SUPABASE_META_HOST: meta.endpoint,
      },
      ssm: {
        SUPABASE_ANON_KEY: anonKey.ssmParameter.arn,
        SUPABASE_SERVICE_KEY: serviceRoleKey.ssmParameter.arn,
      },
      transform: {
        service: {
          networkConfiguration: {
            subnets: vpc.vpc.privateSubnets,
            securityGroups: [kongSecurityGroup.id],
          },
          loadBalancers: [{
            targetGroupArn: loadBalancer.defaultTargetGroup.arn,
            containerName: 'Kong',
            containerPort: 8000,
          }],
        },
      },
    });
  }
}
