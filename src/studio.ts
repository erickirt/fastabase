import 'dotenv/config';

import {
  CloudFormationClient,
  DescribeStacksCommand,
} from '@aws-sdk/client-cloudformation';
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { App } from 'aws-cdk-lib';
import { SupabaseStudio } from './supabase-studio';


async function main() {
  const cfnClient = new CloudFormationClient();
  const secretsClient = new SecretsManagerClient();
  const ssmClient = new SSMClient();

  const supabaseStack = await cfnClient.send(new DescribeStacksCommand({ StackName: 'Supabase' }));
  const supabaseStackOutputs = supabaseStack.Stacks![0].Outputs!;
  const supabaseVpcStack = await cfnClient.send(new DescribeStacksCommand({ StackName: 'SupabaseVPC' }));
  const supabaseVpcStackOutputs = supabaseVpcStack.Stacks![0].Outputs!;

  const supabaseUrl = supabaseStackOutputs.find((o) => o.OutputKey === 'ApiExternalUrl')!.OutputValue!;

  const dashboardUserSecretArn = supabaseStackOutputs.find((o) => o.OutputKey === 'DashboardUserSecretArn')!.OutputValue!;
  const dbSecret = await secretsClient.send(new GetSecretValueCommand({ SecretId: dashboardUserSecretArn }));
  const dbPassword = JSON.parse(dbSecret.SecretString!).password;

  const anonKeyParameterName = supabaseStackOutputs.find((o) => o.OutputKey === 'AnonKeyParameterName')!.OutputValue!;
  const anonKeyParameter = await ssmClient.send(new GetParameterCommand({ Name: anonKeyParameterName }));
  const anonKey = anonKeyParameter.Parameter!.Value!;

  const serviceRoleKeyParameterName = supabaseStackOutputs.find((o) => o.OutputKey === 'ServiceRoleKeyParameterName')!.OutputValue!;
  const serviceRoleKeyParameter = await ssmClient.send(new GetParameterCommand({ Name: serviceRoleKeyParameterName }));
  const serviceRoleKey = serviceRoleKeyParameter.Parameter!.Value!;

  const vpcId = supabaseVpcStackOutputs.find((o) => o.OutputKey === 'VPCId')!.OutputValue!;

  const env = { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION };

  const app = new App();

  new SupabaseStudio(app, 'Studio', {
    env,
    supabaseUrl,
    dbPassword,
    anonKey,
    serviceRoleKey,
    vpcId,
  });

  app.synth();
}

main().catch(e => console.error(e));
