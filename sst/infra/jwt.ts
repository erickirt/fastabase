export class JWT {
  readonly jwtSecretValue;
  readonly jwtSecret: aws.ssm.Parameter;

  private signJWTFunction;

  constructor() {
    this.jwtSecretValue = new random.RandomPassword('JWTSecretValue', {
      length: 64,
      special: false,
    }).result;
    const jwtSecretLink = new sst.Linkable('JWTSecret', {
      properties: {
        value: this.jwtSecretValue,
      },
    });
    this.jwtSecret = new aws.ssm.Parameter('JWTSecretAWS', {
      name: `/${$app.name}/${$app.stage}/JWTSecret`,
      type: 'SecureString',
      value: this.jwtSecretValue,
    });

    this.signJWTFunction = new sst.aws.Function('SignJWT', {
      handler: 'sst/functions/custom-resources/sign-jwt/index.handler',
      link: [jwtSecretLink],
    });
  }

  genApiKey(id: string, props: { roleName: string; issuer: string; expiresIn: string }): {
    ssmParameter: aws.ssm.Parameter;
    apiKey: $util.Output<string>;
  } {
    const jwt = new aws.lambda.Invocation(`JWTSign-${id}`, {
      functionName: this.signJWTFunction.name,
      input: JSON.stringify({
        payload: { role: props.roleName },
        issuer: props.issuer,
        expiresIn: props.expiresIn,
      }),
    });

    const ssmParameter = new aws.ssm.Parameter(`JWTParameter-${id}`, {
      name: `/${$app.name}/${$app.stage}/JWT/${id}`,
      value: $jsonParse(jwt.result),
      type: 'SecureString',
      description: `Supabase JWT for role ${props.roleName}`,
    });

    return {
      ssmParameter,
      apiKey: ssmParameter.value,
    };
  }
}
