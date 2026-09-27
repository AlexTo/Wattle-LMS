# Security

## Reporting a vulnerability

If you discover a potential security issue in this project, please report it privately to tonhudung@gmail.com rather than opening a public GitHub issue.

## Security features

Discava ships with security controls enabled by default, and only relaxes them in the `discava-development` stage, meant for development, testing, and evaluation (see [`stages.config.ts`](packages/common/infra-config/src/stages.config.ts)):

- Cognito authentication with MFA required, fronting both the API and portals
- WAF on the API Gateway, CloudFront distributions, and Cognito user pool
- KMS customer-managed encryption with key rotation for DynamoDB, the API's logs, and the portals' buckets
- DynamoDB deletion protection
- Infrastructure security scanning with [Checkov](https://www.checkov.io) (`infra:checkov`, part of the `build` target)
- Credential scanning with `git-secrets` on every commit (`.husky/pre-commit`)

The `discava-production` stage is the hardened baseline; deploy it (rather than `discava-development`) for anything beyond development, testing, or evaluation.
