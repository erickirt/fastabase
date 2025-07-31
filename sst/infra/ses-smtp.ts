export function sesSmtp({
  region,
  email,
  workMailEnabled,
}: {
  region: $util.Input<string>;
  email: string;
  workMailEnabled: boolean;
}): {
    secret: aws.secretsmanager.Secret;
    host: $util.Output<string>;
    port: number;
    email: string;
  } {
  const host = workMailEnabled ? $interpolate`smtp.mail.${region}.awsapps.com` : $interpolate`email-smtp.${region}.amazonaws.com`;

  /** IAM User to send email via Amazon SES */
  const user = new aws.iam.User('SMTPUser', {
    name: `${$app.name}-${$app.stage}-smtp`,
  });
  new aws.iam.UserPolicy('SendEmailPolicyAttachment', {
    user: user.name,
    policy: aws.iam.getPolicyDocumentOutput({
      statements: [{
        actions: ['ses:SendRawEmail'],
        resources: ['*'],
      }],
    }).json,
  });

  /** SMTP username */
  const accessKey = new aws.iam.AccessKey('SMTPAccessKey', {
    user: user.name,
  });

  const password = accessKey.sesSmtpPasswordV4;

  const secret = new aws.secretsmanager.Secret('SMTPSecret', {
    name: `/${$app.name}/${$app.stage}/SMTPSecret`,
    description: 'Supabase - SMTP Secret',
  });
  new aws.secretsmanager.SecretVersion('SMTPSecretVersion', {
    secretId: secret.id,
    secretString: $resolve([accessKey.id, password, host]).apply(([username, password, host]) => JSON.stringify({
      username,
      password,
      host,
    })),
  });

  return {
    secret,
    host,
    port: 587,
    email,
  };
}
