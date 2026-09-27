/**
 * Copyright Discava Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import {
  CfnResource,
  DefaultStackSynthesizer,
  type IBoundStackSynthesizer,
  type ISynthesisSession,
  PermissionsBoundary,
  type Stack,
  Stage,
} from 'aws-cdk-lib';
import type { IConstruct } from 'constructs';

/**
 * Context key which, when `true`, applies each stage's permissions boundary
 * (see {@link stagePermissionsBoundary}) to every IAM role it creates. The
 * deploy workflow sets it; the boundary policies themselves are created by
 * scripts/setup-stage.sh, so local deploys that haven't run it leave it
 * unset.
 */
export const STAGE_PERMISSIONS_BOUNDARY_CONTEXT_KEY =
  'discava:stagePermissionsBoundary';

/**
 * Name of the managed policy scripts/setup-stage.sh creates as the
 * permissions boundary for a stage's IAM roles.
 */
export const stagePermissionsBoundaryName = (stageName: string): string =>
  `permissions-boundary-${stageName}`;

/**
 * The permissions boundary to apply to a stage's roles, or undefined when
 * {@link STAGE_PERMISSIONS_BOUNDARY_CONTEXT_KEY} isn't enabled.
 */
export const stagePermissionsBoundary = (
  scope: IConstruct,
  stageName: string,
): PermissionsBoundary | undefined =>
  isPermissionsBoundaryEnabled(scope)
    ? PermissionsBoundary.fromName(stagePermissionsBoundaryName(stageName))
    : undefined;

const isPermissionsBoundaryEnabled = (scope: IConstruct): boolean => {
  const enabled = scope.node.tryGetContext(
    STAGE_PERMISSIONS_BOUNDARY_CONTEXT_KEY,
  );
  return enabled === true || enabled === 'true';
};

/**
 * Stack synthesizer that keeps stages sharing an AWS account apart:
 *
 * - Publishes each stage's file assets (templates and bundles) under a
 *   `<stage>/` prefix in the shared CDK bootstrap bucket, so deploy
 *   credentials can be scoped to one stage's objects and one stage can't
 *   overwrite assets another is about to deploy. Stacks outside a stage keep
 *   the bucket root.
 * - When {@link STAGE_PERMISSIONS_BOUNDARY_CONTEXT_KEY} is enabled, applies the
 *   stage's permissions boundary to roles CDK only creates while preparing the
 *   app for synthesis (e.g. cross-region export writers/readers), which the
 *   stage's `permissionsBoundary` aspect runs too early to reach.
 */
export class StageIsolationSynthesizer extends DefaultStackSynthesizer {
  override reusableBind(stack: Stack): IBoundStackSynthesizer {
    return new BoundStageIsolationSynthesizer(
      Stage.of(stack)?.stageName || undefined,
    ).reusableBind(stack);
  }
}

class BoundStageIsolationSynthesizer extends DefaultStackSynthesizer {
  constructor(private readonly stageName: string | undefined) {
    super({ bucketPrefix: stageName ? `${stageName}/` : undefined });
  }

  override synthesize(session: ISynthesisSession): void {
    const stack = this.boundStack;
    if (this.stageName && isPermissionsBoundaryEnabled(stack)) {
      const boundaryArn = stack.formatArn({
        service: 'iam',
        region: '',
        resource: 'policy',
        resourceName: stagePermissionsBoundaryName(this.stageName),
      });
      for (const node of stack.node.findAll()) {
        if (
          CfnResource.isCfnResource(node) &&
          node.cfnResourceType === 'AWS::IAM::Role'
        ) {
          node.addPropertyOverride('PermissionsBoundary', boundaryArn);
        }
      }
    }
    super.synthesize(session);
  }
}
