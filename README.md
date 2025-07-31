# Fastabase

Fastabase is a solution to self-host [Supabase](https://supabase.com/) on AWS and use [PlanetScale Postgres](https://planetscale.com/blog/planetscale-for-postgres) as the database provider.

## Overview

Fastabase is built using several components:

- [SST](https://sst.dev/) to orchestrate the deployment to AWS
- [OpenNext](https://opennext.js.org/aws) to deploy Supabase Studio as a serverless component
- [Supabase](https://github.com/supabase/supabase) components like Storage, Auth, etc.

## Architecture

![diagram](/docs/images/architecture.svg)

- Most of the Supabase components are deployed as Docker containers to ECS Fargate
- Entrypoint for Supabase API is an Application Load Balancer behind a CloudFront distribution
- Amazon SES SMTP servers are used for sending emails
- Supabase Studio is deployed using OpenNext
  - Studio is protected by user/password auth via a CloudFront function

## Prerequisites

1. Install Node.js 22 and pnpm
2. PlanetScale:
   1. Go to Cluster configuration -> Extensions and enable `pg_stat_statements` and `pg_cron` extensions.
   2. Go to Cluster configuration -> Parameters and set `max_client_conn` to at least `50`.

## Deployment

1. Clone this repository and `cd` into it.

2. Init Git submodules:

    ```shell
    git submodule update --init
    ```

3. Create a `config.yaml` configuration file:

    ```shell
    cp config.yaml.example config.yaml
    ```

4. Fill in the values in `config.yaml`.

5. Install the dependencies:

    ```shell
    pnpm i
    ```

6. Set up the AWS credentials:

    ```shell
    export AWS_PROFILE=<profile>
    ```

    > [!TIP]
    > To learn how to set up the AWS credentials in your terminal, please refer to the [AWS documentation](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-files.html).

7. Run the deployment:

    ```shell
    pnpm run deploy
    ```

    > [!WARNING]
    > SST deploys resources to a certain [stage](https://sst.dev/docs/reference/cli/#stage). This allows you to deploy multiple copies of your app in the same account.
    >
    > **By default, the stage name is set to the username on your local machine.** You can specify a different stage name with `pnpm run deploy --stage <name>`.

## Removal

To remove a deployed Fastabase instance, run:

```shell
pnpm run remove
```

> [!NOTE]
> If you used a non-default stage name during deployment, you also need to provide it here with `pnpm run remove --stage <name>`.

## Roadmap

### Core Supabase components

- [x] Auth
- [x] Storage
- [x] PostgREST
- [x] Imgproxy
- [x] Pg-meta
- [x] Logs
- [ ] Realtime
- [ ] Edge functions

### Customization

- [x] OpenAI API key
- [ ] External auth providers
- [ ] Custom domain

### Improvements

- [ ] Show real DB credentials in the Studio's "Connect" dialog (currently hardcoded to `localhost` in Supabase's codebase)

## Notes

- By default, Amazon SES is in sandbox mode, which means you can only send emails from and to verified email addresses. Make sure to exit the sandbox mode before sending emails to real users.

- Logs and Realtime components currently do not support connecting to Postgres with SSL, so they are connecting to PlanetScale via [Envoy](https://www.envoyproxy.io/) that serves as an SSL proxy. Envoy is deployed as an ECS service. Once the SSL support is implemented in Logs and Realtime components, the Envoy service will be removed.
