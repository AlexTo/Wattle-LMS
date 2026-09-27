/**
 * Copyright Discava Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { Stage, StageProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {
  ApplicationStack,
  ApplicationStackProps,
} from '../stacks/application-stack.js';

export interface ApplicationStageProps extends StageProps {
  /** Passed through to ApplicationStack to control per-component settings. */
  readonly identity?: ApplicationStackProps['identity'];
  readonly coreApi?: ApplicationStackProps['coreApi'];
  readonly instructorApi?: ApplicationStackProps['instructorApi'];
  readonly coreTable?: ApplicationStackProps['coreTable'];
  readonly studentPortal?: ApplicationStackProps['studentPortal'];
  readonly instructorPortal?: ApplicationStackProps['instructorPortal'];
  readonly adminPortal?: ApplicationStackProps['adminPortal'];
  readonly lessonMedia?: ApplicationStackProps['lessonMedia'];
}

/**
 * Defines a collection of CDK Stacks which make up your application
 */
export class ApplicationStage extends Stage {
  constructor(
    scope: Construct,
    id: string,
    {
      identity,
      coreApi,
      instructorApi,
      coreTable,
      studentPortal,
      instructorPortal,
      adminPortal,
      lessonMedia,
      ...props
    }: ApplicationStageProps,
  ) {
    super(scope, id, props);

    new ApplicationStack(this, 'Application', {
      crossRegionReferences: true,
      identity,
      coreApi,
      instructorApi,
      coreTable,
      studentPortal,
      instructorPortal,
      adminPortal,
      lessonMedia,
    });
  }
}
