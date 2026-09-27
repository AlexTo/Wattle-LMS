/**
 * Copyright Discava Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { readFileSync } from 'node:fs';
import { App, CfnOutput, Stack, Stage } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { Asset } from 'aws-cdk-lib/aws-s3-assets';
import { AssetManifestArtifact } from 'aws-cdk-lib/cx-api';
import { describe, expect, it } from 'vitest';
import {
  STAGE_PERMISSIONS_BOUNDARY_CONTEXT_KEY,
  StageIsolationSynthesizer,
  stagePermissionsBoundary,
} from './stage-isolation.js';

const env = { account: 'test-account', region: 'ap-southeast-2' };

type AssetManifestFile = {
  files: Record<
    string,
    { destinations: Record<string, { objectKey: string }> }
  >;
};

/** Object keys of every file asset (including the template) for a stack. */
const fileAssetKeys = (stack: Stack): string[] => {
  const assembly = Stage.of(stack)!.synth();
  const manifest = assembly
    .getStackArtifact(stack.artifactId)
    .dependencies.find((d) => d instanceof AssetManifestArtifact);
  const { files } = JSON.parse(
    readFileSync(manifest!.file, 'utf8'),
  ) as AssetManifestFile;
  return Object.values(files).flatMap((file) =>
    Object.values(file.destinations).map((d) => d.objectKey),
  );
};

// Synthesizing a stack takes well under a second in isolation but can pass
// Vitest's 5s default when CI runs every project's tests in parallel.
describe('StageIsolationSynthesizer', { timeout: 30_000 }, () => {
  it('prefixes every asset, including the template, with the stage name', () => {
    const app = new App({
      defaultStackSynthesizer: new StageIsolationSynthesizer(),
    });
    const stack = new Stack(new Stage(app, 'my-stage', { env }), 'Stack');
    new Asset(stack, 'Asset', { path: __dirname });

    const keys = fileAssetKeys(stack);
    expect(keys.length).toBeGreaterThanOrEqual(2);
    for (const key of keys) {
      expect(key.startsWith('my-stage/')).toBe(true);
    }
  });

  it('gives each stage its own prefix', () => {
    const app = new App({
      defaultStackSynthesizer: new StageIsolationSynthesizer(),
    });
    const dev = new Stack(new Stage(app, 'dev', { env }), 'Stack');
    const prod = new Stack(new Stage(app, 'prod', { env }), 'Stack');

    expect(fileAssetKeys(dev).every((k) => k.startsWith('dev/'))).toBe(true);
    expect(fileAssetKeys(prod).every((k) => k.startsWith('prod/'))).toBe(true);
  });

  it('leaves stacks outside a stage at the bucket root', () => {
    const app = new App({
      defaultStackSynthesizer: new StageIsolationSynthesizer(),
    });
    const stack = new Stack(app, 'Stack', { env });

    expect(fileAssetKeys(stack).every((k) => !k.includes('/'))).toBe(true);
  });
});

describe('stage permissions boundary', { timeout: 30_000 }, () => {
  /**
   * Roles across two stacks linked by a cross-region reference, which makes
   * CDK add export writer/reader custom resource roles while preparing the app,
   * after the stage's permissions boundary aspect has run.
   */
  const roleBoundaries = (context: Record<string, unknown>) => {
    const app = new App({
      context,
      defaultStackSynthesizer: new StageIsolationSynthesizer(),
    });
    const stage = new Stage(app, 'my-stage', {
      env,
      permissionsBoundary: stagePermissionsBoundary(app, 'my-stage'),
    });
    const producer = new Stack(stage, 'Producer', {
      env: { ...env, region: 'us-east-1' },
      crossRegionReferences: true,
    });
    const role = new Role(producer, 'Role', {
      assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
    });
    const consumer = new Stack(stage, 'Consumer', {
      env,
      crossRegionReferences: true,
    });
    new CfnOutput(consumer, 'RoleArn', { value: role.roleArn });
    return [producer, consumer].flatMap((stack) =>
      Object.values(Template.fromStack(stack).findResources('AWS::IAM::Role')),
    );
  };

  it('applies the stage boundary to roles when enabled', () => {
    const roles = roleBoundaries({
      [STAGE_PERMISSIONS_BOUNDARY_CONTEXT_KEY]: 'true',
    });
    // The app role plus the export writer and reader provider roles.
    expect(roles.length).toBeGreaterThanOrEqual(3);
    for (const role of roles) {
      expect(JSON.stringify(role.Properties.PermissionsBoundary)).toContain(
        ':policy/permissions-boundary-my-stage',
      );
    }
  });

  it('applies no boundary by default', () => {
    const roles = roleBoundaries({});
    for (const role of roles) {
      expect(role.Properties.PermissionsBoundary).toBeUndefined();
    }
  });
});
