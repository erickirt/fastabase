import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Nextjs } from 'cdk-nextjs-standalone';
import { Construct } from 'constructs';

interface SupabaseStudioProps {
  supabaseUrl: string;
  dbPassword: string;
  anonKey: string;
  serviceRoleKey: string;
  vpcId: string;
}

export class SupabaseStudio extends cdk.Stack {
  /** URL of production branch */
  readonly prodBranchUrl: string;

  constructor(scope: Construct, id: string, props: cdk.StackProps & SupabaseStudioProps) {
    super(scope, id, props);

    const { supabaseUrl, dbPassword, anonKey, serviceRoleKey } = props;

    const vpc = ec2.Vpc.fromLookup(this, 'VPC', { vpcId: props.vpcId });

    const nextjs = new Nextjs(this, 'nextjs', {
      nextjsPath: 'supabase/apps/studio',
      overrides: {
        nextjsServer: {
          functionProps: {
            vpc,
            vpcSubnets: vpc.selectSubnets({
              subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
            }),
          },
        },
      },
      environment: {
        STUDIO_PG_META_URL: `${supabaseUrl}/pg`,
        SUPABASE_URL: supabaseUrl,
        SUPABASE_PUBLIC_URL: supabaseUrl,
        POSTGRES_PASSWORD: dbPassword,
        SUPABASE_ANON_KEY: anonKey,
        SUPABASE_SERVICE_KEY: serviceRoleKey,
      },
    });

    new cdk.CfnOutput(this, 'CloudFrontDistributionDomain', {
      value: nextjs.distribution.distributionDomain,
    });

    this.prodBranchUrl = `https://${nextjs.distribution.distributionDomain}`;

    new cdk.CfnOutput(this, 'StudioUrl', {
      value: this.prodBranchUrl,
      description: 'The dashboard for Supabase projects',
    });
  }
}
