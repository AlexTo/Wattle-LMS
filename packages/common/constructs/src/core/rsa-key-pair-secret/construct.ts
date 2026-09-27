/**
 * Copyright Discava Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { CustomResource, Duration, Names, Stack } from 'aws-cdk-lib';
import { Grant, IGrantable, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Code, Function, Runtime } from 'aws-cdk-lib/aws-lambda';
import { ISecret, Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { Provider } from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';
import * as url from 'url';

/**
 * An RSA key pair, generated once and held only in Secrets Manager (as
 * `{ publicKeyPem, privateKeyPem }`), with the public half also exposed as
 * a plain string for consumers that need to register it elsewhere (e.g.
 * CloudFront's `PublicKey` resource).
 *
 * CDK cannot generate an RSA key pair as a plain CloudFormation property,
 * so this is provisioned by a custom resource: a small Lambda generates the
 * pair on create and stores it as one Secrets Manager secret. The pair is
 * never rotated on stack updates.
 */
export class RsaKeyPairSecret extends Construct {
  public readonly publicKeyPem: string;
  public readonly secretArn: string;
  private readonly secret: ISecret;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    const secretName = Names.uniqueResourceName(this, {
      maxLength: 128,
      separator: '/',
    });

    const onEvent = new Function(this, 'OnEvent', {
      runtime: Runtime.NODEJS_24_X,
      handler: 'handler.handler',
      timeout: Duration.minutes(2),
      // This construct's own source lives alongside handler.js, so the
      // asset directory is excluded down to just the runtime handler.
      code: Code.fromAsset(url.fileURLToPath(new URL('.', import.meta.url)), {
        exclude: ['*.ts'],
      }),
    });
    const { region, account } = Stack.of(this);
    onEvent.addToRolePolicy(
      new PolicyStatement({
        actions: [
          'secretsmanager:CreateSecret',
          'secretsmanager:DescribeSecret',
          'secretsmanager:GetSecretValue',
          'secretsmanager:DeleteSecret',
        ],
        // The real secret ARN (with AWS's random suffix) isn't known until
        // the custom resource creates it, so its own execution role is
        // scoped to the deterministic name prefix rather than an exact ARN.
        resources: [
          `arn:aws:secretsmanager:${region}:${account}:secret:${secretName}*`,
        ],
      }),
    );

    const resource = new CustomResource(this, 'Resource', {
      serviceToken: new Provider(this, 'Provider', { onEventHandler: onEvent })
        .serviceToken,
      resourceType: 'Custom::RsaKeyPairSecret',
      properties: { SecretName: secretName },
    });

    this.secretArn = resource.getAttString('SecretArn');
    this.publicKeyPem = resource.getAttString('PublicKeyPem');
    this.secret = Secret.fromSecretCompleteArn(this, 'Secret', this.secretArn);
  }

  /** Grants read access to the secret holding the key pair's private key. */
  public grantReadSecret(grantee: IGrantable): Grant {
    return this.secret.grantRead(grantee);
  }
}
