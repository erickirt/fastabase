export class VPC {
  readonly vpc;

  constructor() {
    this.vpc = new sst.aws.Vpc('VPC', {
      nat: 'ec2',
      bastion: true,
      transform: {
        vpc: {
          tags: {
            Name: `/${$app.name}/${$app.stage}/VPC`,
          },
          // cidrBlock: '10.0.0.0/16',
        },
      //   publicSubnet(args) {
      //     args.cidrBlock = (args.cidrBlock as string).replace(/^10\./, '20.');
      //   },
      //   privateSubnet(args) {
      //     args.cidrBlock = (args.cidrBlock as string).replace(/^10\./, '20.');
      //   },
      },
    });
  }
}

// const peering = new aws.ec2.VpcPeeringConnection('VPCPeeringPlanetScale', {
//   peerOwnerId: psEnv.PLANETSCALE_ACCOUNT_ID,
//   peerRegion: psEnv.PLANETSCALE_REGION,
//   peerVpcId: psEnv.PLANETSCALE_VPC_ID,
//   vpcId: vpc.id,
// });

// $resolve([vpc.nodes.publicRouteTables, vpc.nodes.privateRouteTables]).apply(([publicRouteTables, privateRouteTables]) => {
//   [...publicRouteTables, ...privateRouteTables].forEach((routeTable, i) => {
//     new aws.ec2.Route(`RouteToPlanetScale-${i}`, {
//       routeTableId: routeTable.id,
//       destinationCidrBlock: psEnv.PLANETSCALE_VPC_CIDR,
//       vpcPeeringConnectionId: peering.id,
//     });
//   });
// });

// new aws.ec2.SecurityGroup('PlanetScaleSG', {
//   vpcId: vpc.id,
//   egress: [
//     {
//       protocol: 'tcp',
//       fromPort: psEnv.POSTGRES_PORT,
//       toPort: psEnv.POSTGRES_PORT,
//       cidrBlocks: [psEnv.PLANETSCALE_VPC_CIDR],
//     },
//     {
//       protocol: 'tcp',
//       fromPort: 6432,
//       toPort: 6432,
//       cidrBlocks: [psEnv.PLANETSCALE_VPC_CIDR],
//     },
//   ],
// });
