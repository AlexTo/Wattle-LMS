# @discava/student-portal
This library was generated with [@aws/nx-plugin](https://github.com/awslabs/nx-plugin-for-aws/).

## Building

Run `pnpm nx build @discava/student-portal [--skip-nx-cache]` to build the application.

## Run dev server

Run `pnpm nx serve @discava/student-portal`

## Running unit tests

Run `pnpm nx test @discava/student-portal` to execute the unit tests via Vitest.

### Updating snapshots

To update snapshots, run the following command:

`pnpm nx test @discava/student-portal --configuration=update-snapshot`

## Run lint

Run `pnpm nx lint @discava/student-portal`

### Fixable issues

You can also automatically fix some lint errors by running the following command:

`pnpm nx lint @discava/student-portal --configuration=fix`

### Runtime config

In order to integrate with cognito or trpc backends, you need to have a `runtime-config.json` file in your `/public` website directory. You can fetch this is follows:

`pnpm nx load-runtime-config @discava/student-portal`

> [!IMPORTANT]
> Ensure you have AWS CLI and curl installed
> You have deployed your CDK infrastructure into the appropriate account
> You have assumed a role in the AWS account with sufficient permissions to call describe-stacks from cloudformation

## Useful links

- [React website reference docs](TODO)
- [Learn more about NX](https://nx.dev/getting-started/intro)
