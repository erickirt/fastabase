import _ from 'lodash';

export class Service extends sst.aws.Service {
  endpoint: $util.Output<string>;
  port: $util.Output<number>;
  cluster: sst.aws.Cluster;

  constructor(name: string, args: sst.aws.ServiceArgs & {
    port: $util.Input<number>;
    additionalPorts?: $util.Input<number>[];
    splunk?: {
      token: $util.Input<string>;
      url: $util.Input<string>;
    };
  }, opts: $util.ComponentResourceOptions = {}) {
    super(name, _.merge({
      architecture: 'arm64',
      wait: true,
      scaling: {
        cpuUtilization: 50,
      },
      transform: {
        service: {
          waitForSteadyState: true,
        },
        taskDefinition(taskArgs) {
          taskArgs.containerDefinitions = $jsonStringify($jsonParse(taskArgs.containerDefinitions).apply((d) => {
            // port mappings
            d[0].portMappings = [args.port, ...args.additionalPorts ?? []].map((port) => ({ containerPort: port }));

            // ulimits
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

            // splunk log driver
            if (args.splunk) {
              d[0].logConfiguration = {
                logDriver: 'splunk',
                options: {
                  'splunk-token': args.splunk.token,
                  'splunk-url': args.splunk.url,
                  'splunk-verify-connection': 'false',
                  'tag': '{{.Name}}',
                },
              };
            }

            return d;
          }));
        },
      },
    } satisfies Partial<sst.aws.ServiceArgs>, args), _.merge({
      customTimeouts: {
        create: '5m',
        update: '5m',
      },
    } satisfies Partial<$util.ComponentResourceOptions>, opts));

    this.cluster = args.cluster;
    this.port = $util.output(args.port);
    this.endpoint = $interpolate`http://${this.service}:${args.port}`;
  }
}
