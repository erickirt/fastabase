export class CDN {
  readonly distribution: aws.cloudfront.Distribution;
  readonly cacheManager: {
    url: $util.Output<string>;
    apiKey: aws.secretsmanager.Secret;
  };

  constructor({ loadBalancer }: { loadBalancer: aws.lb.LoadBalancer | $util.Output<aws.lb.LoadBalancer> }) {
    const cachePolicy: aws.cloudfront.CachePolicy = new aws.cloudfront.CachePolicy('CDNCachePolicy', {
      name: $interpolate`${$app.name}-${$app.stage}-${aws.getRegionOutput().name}-CDNCachePolicy`,
      comment: 'Policy for Supabase API',
      minTtl: 0,
      maxTtl: 600,
      defaultTtl: 1,
      parametersInCacheKeyAndForwardedToOrigin: {
        headersConfig: {
          headerBehavior: 'whitelist',
          headers: {
            items: ['apikey', 'authorization', 'host'],
          },
        },
        queryStringsConfig: {
          queryStringBehavior: 'all',
        },
        cookiesConfig: {
          cookieBehavior: 'none',
        },
        enableAcceptEncodingGzip: true,
        enableAcceptEncodingBrotli: true,
      },
    });

    const responseHeadersPolicy: aws.cloudfront.ResponseHeadersPolicy = new aws.cloudfront.ResponseHeadersPolicy('CDNResponseHeadersPolicy', {
      name: $interpolate`${$app.name}-${$app.stage}-${aws.getRegionOutput().name}-CDNResponseHeadersPolicy`,
      comment: 'Policy for Supabase API',
      customHeadersConfig: {
        items: [{
          header: 'server',
          value: 'cloudfront',
          override: true,
        }],
      },
    });

    const allViewer = aws.cloudfront.getOriginRequestPolicyOutput({
      name: 'Managed-AllViewer',
    });

    const cachingOptimized = aws.cloudfront.getCachePolicyOutput({
      name: 'Managed-CachingOptimized',
    });

    this.distribution = new aws.cloudfront.Distribution('CDNDistribution', {
      enabled: true,
      httpVersion: 'http2and3',
      isIpv6Enabled: true,
      comment: `Supabase - CDN (${$app.stage})`,
      origins: [{
        domainName: loadBalancer.dnsName,
        originId: 'alb-origin',
        customOriginConfig: {
          httpPort: 80,
          httpsPort: 443,
          originProtocolPolicy: 'http-only',
          originSslProtocols: ['TLSv1.2'],
        },
      }],
      defaultCacheBehavior: {
        viewerProtocolPolicy: 'redirect-to-https',
        allowedMethods: ['GET', 'HEAD', 'OPTIONS', 'PUT', 'POST', 'PATCH', 'DELETE'],
        cachePolicyId: cachePolicy.id,
        originRequestPolicyId: allViewer.id!.apply((id) => id!),
        responseHeadersPolicyId: responseHeadersPolicy.id,
        cachedMethods: ['GET', 'HEAD'],
        targetOriginId: 'alb-origin',
      },
      orderedCacheBehaviors: [{
        pathPattern: 'storage/v1/object/public/*',
        viewerProtocolPolicy: 'redirect-to-https',
        allowedMethods: ['GET', 'HEAD'],
        cachedMethods: ['GET', 'HEAD'],
        cachePolicyId: cachingOptimized.id!.apply((id) => id!),
        responseHeadersPolicyId: responseHeadersPolicy.id,
        targetOriginId: 'alb-origin',
      }],
      customErrorResponses: [
        { errorCode: 500, errorCachingMinTtl: 10 },
        { errorCode: 501, errorCachingMinTtl: 10 },
        { errorCode: 502, errorCachingMinTtl: 10 },
        { errorCode: 503, errorCachingMinTtl: 10 },
        { errorCode: 504, errorCachingMinTtl: 10 },
      ],
      viewerCertificate: {
        cloudfrontDefaultCertificate: true,
      },
      restrictions: {
        geoRestriction: {
          restrictionType: 'none',
        },
      },
    });

    const cacheManagerApiKeyString = new random.RandomPassword('CacheManagerApiKey', {
      length: 32,
      special: false,
    }).result;
    const cacheManagerApiKey = new aws.secretsmanager.Secret('CacheManagerApiKeySecret', {
      name: `/${$app.name}/${$app.stage}/cache-manager-api-key`,
      description: 'Supabase - API key for CDN cache manager',
    });
    new aws.secretsmanager.SecretVersion( 'CacheManagerApiKeyVersion', {
      secretId: cacheManagerApiKey.id,
      secretString: cacheManagerApiKeyString,
    });

    const queue = new sst.aws.Queue('CacheManagerQueue');

    const commonProps: Partial<sst.aws.FunctionArgs> = {
      nodejs: {
        esbuild: {
          external: ['@aws-sdk/*', '@aws-lambda-powertools/*'],
        },
      },
      layers: [$interpolate`arn:aws:lambda:${aws.getRegionOutput().name}:094274105915:layer:AWSLambdaPowertoolsTypeScript:25`],
      transform: {
        function: {
          tracingConfig: {
            mode: 'Active',
          },
        },
      },
    };

    const apiFn = new sst.aws.Function('CacheManagerApiFunction', {
      ...commonProps,
      handler: 'sst/functions/cache-manager/api.handler',
      link: [queue],
      environment: {
        API_KEY: cacheManagerApiKeyString,
      },
      url: true,
    });

    const queueConsumerFn = new sst.aws.Function('CacheManagerQueueConsumerFunction', {
      ...commonProps,
      handler: 'sst/functions/cache-manager/queue-consumer.handler',
      link: [queue, this.distribution],
    });

    queue.subscribe(queueConsumerFn.arn, {
      batch: {
        size: 100,
        window: '5 seconds',
      },
    });

    this.cacheManager = {
      url: apiFn.url,
      apiKey: cacheManagerApiKey,
    };
  }
}
