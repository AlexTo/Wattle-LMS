/**
 * Copyright Discava Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
const { generateKeyPairSync } = require('node:crypto');
const {
  SecretsManagerClient,
  CreateSecretCommand,
  GetSecretValueCommand,
  DeleteSecretCommand,
} = require('@aws-sdk/client-secrets-manager');

const secretsManager = new SecretsManagerClient();

const generateKeyPairPem = () => {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return { publicKeyPem: publicKey, privateKeyPem: privateKey };
};

exports.handler = async (event) => {
  const secretName = event.ResourceProperties.SecretName;

  if (event.RequestType === 'Delete') {
    try {
      await secretsManager.send(
        new DeleteSecretCommand({
          SecretId: secretName,
          ForceDeleteWithoutRecovery: true,
        }),
      );
    } catch (e) {
      if (e.name !== 'ResourceNotFoundException') throw e;
    }
    return { PhysicalResourceId: secretName };
  }

  if (event.RequestType === 'Update') {
    try {
      const { SecretString, ARN } = await secretsManager.send(
        new GetSecretValueCommand({ SecretId: secretName }),
      );
      const { publicKeyPem } = JSON.parse(SecretString);
      return {
        PhysicalResourceId: secretName,
        Data: { PublicKeyPem: publicKeyPem, SecretArn: ARN },
      };
    } catch (e) {
      if (e.name !== 'ResourceNotFoundException') throw e;
      // Fall through to Create's behavior below if the secret is missing.
    }
  }

  const { publicKeyPem, privateKeyPem } = generateKeyPairPem();
  const { ARN } = await secretsManager.send(
    new CreateSecretCommand({
      Name: secretName,
      SecretString: JSON.stringify({ publicKeyPem, privateKeyPem }),
    }),
  );

  return {
    PhysicalResourceId: secretName,
    Data: { PublicKeyPem: publicKeyPem, SecretArn: ARN },
  };
};
