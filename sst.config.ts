/// <reference path="./.sst/platform/config.d.ts" />
export default $config({
  app(input) {
    return {
      name: 'fastabase',
      removal: input?.stage === 'production' ? 'retain' : 'remove',
      home: 'aws',
      providers: {
        aws: '6.83.0',
        awsx: '2.22.0',
        random: '4.18.2',
        command: '1.1.0',
      },
    };
  },
  async run() {
    const fs = await import('fs/promises');
    const { parse } = await import('yaml');
    const { DB } = await import('./sst/infra/db');
    const { Supabase } = await import('./sst/infra/supabase');
    const { VPC } = await import('./sst/infra/vpc');
    const { configSchema } = await import('./sst/config');
    const config = configSchema.parse(
      parse(await fs.readFile('config.yaml', 'utf-8')),
    );
    $transform(sst.aws.Function, (args) => {
      args.runtime ??= 'nodejs22.x';
      args.architecture ??= 'arm64';
      args.timeout ??= '10 seconds';
    });
    sst.Linkable.wrap(aws.cloudfront.Distribution, (distribution) => {
      return {
        properties: {
          id: distribution.id,
        },
        include: [
          sst.aws.permission({
            actions: ['cloudfront:CreateInvalidation'],
            resources: [distribution.arn],
          }),
        ],
      };
    });
    const vpc = new VPC();
    const db = new DB({ vpc, config });
    const supabase = new Supabase({ vpc, db, config });
    return {
      studioUrl: supabase.studio.url,
      dashboardUser: supabase.dashboardUser,
      dashboardPassword: supabase.dashboardPassword,
    };
  },
});
