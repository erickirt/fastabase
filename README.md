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
2. Enable `pg_stat_statements` and `pg_cron` extensions in PlanetScale on the "Cluster configuration" -> "Extensions" tab

## Deployment

To deploy Fastabase you would need to follow these steps:

1. Init Git submodules:
    ```shell
    git submodule update --init
    ```

2. Create a `config.yaml` configuration file:
    ```
    cp config.yaml.example config.yaml
    ```

3. Fill in the `config.yaml` file with the required information.

4. Install all the dependencies:
    ```shell
    pnpm i
    ```

5. Set up the AWS credentials.
    ```shell
    export AWS_PROFILE=<profile>
    ```
    > **Note**: To learn how to set up the AWS credentials in your terminal, please refer to the [AWS documentation](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-files.html).

6. Run the deployment:
    ```shell
    pnpm run deploy
    ```

# Removal

To remove the Fastabase deployment, run:
```shell
pnpm run remove
```

## Roadmap

Core Supabase components:
- [x] Auth
- [x] Storage
- [x] PostgREST
- [x] Imgproxy
- [x] Pg-meta
- [ ] Realtime
- [ ] Edge functions
- [ ] Logs

Customization:
- [ ] External auth providers
- [ ] Custom domain
- [ ] OpenAI API key

Improvements:
- [ ] Show real DB credentials in the Studio's "Connect" dialog (currently hardcoded to `localhost` in Supabase's codebase)

## Notes

- By default, Amazon SES is in sandbox mode, which means you can only send emails from and to verified email addresses. Make sure to exit the sandbox mode before sending emails to real users.

- Realtime component currently can't be used with PlanetScale, because PlanetScale requires SSL and Realtime component doesn't allow SSL to be configured for the database connection.
