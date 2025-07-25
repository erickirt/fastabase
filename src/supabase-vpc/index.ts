import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
import { parseEnv, z } from 'znv';

export class SupabaseVPC extends cdk.Stack {
  /** VPC for Containers and Database */
  readonly vpc: ec2.IVpc;

  readonly dbSg: ec2.ISecurityGroup;

  constructor(scope: Construct, id: string, props: cdk.StackProps) {
    super(scope, id, props);

    const psEnv = parseEnv(process.env, {
      PLANETSCALE_ACCOUNT_ID: z.string().min(1),
      PLANETSCALE_REGION: z.string().min(1),
      PLANETSCALE_VPC_ID: z.string().min(1),
      PLANETSCALE_VPC_CIDR: z.string().min(1),
      PLANETSCALE_PEERING_ROLE_ARN: z.string().min(1),
      POSTGRES_PORT: z.number(),
    });

    this.vpc = new ec2.Vpc(this, 'VPC', {
      natGateways: 1,
      ipAddresses: ec2.IpAddresses.cidr('20.0.0.0/16'),
    });

    new cdk.CfnOutput(this, 'VPCId', {
      value: this.vpc.vpcId,
    });

    const peering = new ec2.CfnVPCPeeringConnection(this, 'VPCPeeringPlanetScale', {
      peerOwnerId: psEnv.PLANETSCALE_ACCOUNT_ID,
      peerRegion: psEnv.PLANETSCALE_REGION,
      peerVpcId: psEnv.PLANETSCALE_VPC_ID,
      vpcId: this.vpc.vpcId,
      peerRoleArn: psEnv.PLANETSCALE_PEERING_ROLE_ARN,
    });

    this.vpc.publicSubnets.forEach((subnet, index) => {
      new ec2.CfnRoute(this, `RouteToPlanetScalePublic-${index}`, {
        routeTableId: subnet.routeTable.routeTableId,
        destinationCidrBlock: psEnv.PLANETSCALE_VPC_CIDR,
        vpcPeeringConnectionId: peering.ref,
      });
    });

    this.vpc.privateSubnets.forEach((subnet, index) => {
      new ec2.CfnRoute(this, `RouteToPlanetScalePrivate-${index}`, {
        routeTableId: subnet.routeTable.routeTableId,
        destinationCidrBlock: psEnv.PLANETSCALE_VPC_CIDR,
        vpcPeeringConnectionId: peering.ref,
      });
    });

    this.dbSg = new ec2.SecurityGroup(this, 'PlanetScaleSG', {
      vpc: this.vpc,
      allowAllOutbound: false,
    });
    this.dbSg.addEgressRule(
      ec2.Peer.ipv4(psEnv.PLANETSCALE_VPC_CIDR),
      ec2.Port.tcp(psEnv.POSTGRES_PORT),
    );
    this.dbSg.addEgressRule(
      ec2.Peer.ipv4(psEnv.PLANETSCALE_VPC_CIDR),
      // PSBouncer
      ec2.Port.tcp(6432),
    );
  }
}
