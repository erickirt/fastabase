import _ from 'lodash';

export class Service extends sst.aws.Service {
  endpoint: $util.Output<string>;
  port: $util.Output<number>;

  constructor(name: string, args: sst.aws.ServiceArgs & {
    port: $util.Input<number>;
    additionalPorts?: $util.Input<number>[];
  }, opts: $util.ComponentResourceOptions = {}) {
    super(name, _.merge({
      architecture: 'arm64',
      wait: true,
      scaling: {
        cpuUtilization: 50,
      },
      transform: {
        taskDefinition(taskArgs) {
          taskArgs.containerDefinitions = $jsonStringify($jsonParse(taskArgs.containerDefinitions).apply((d) => {
            d[0].portMappings = [args.port, ...args.additionalPorts ?? []].map((port) => ({ containerPort: port }));
            if (!d[0].ulimits) {
              d[0].ulimits = [];
            }
            const ulimits = d[0].ulimits?.find((ulimit: { name: string }) => ulimit.name === 'nofile');
            if (ulimits) {
              ulimits.softLimit = 65536;
              ulimits.hardLimit = 65536;
            } else {
              d[0].ulimits.push({ name: 'nofile', softLimit: 65536, hardLimit: 65536 });
            }
            return d;
          }));
        },
      },
    } satisfies Partial<sst.aws.ServiceArgs>, args), opts);

    this.port = $util.output(args.port);
    this.endpoint = $interpolate`http://${this.service}:${args.port}`;
  }
}
