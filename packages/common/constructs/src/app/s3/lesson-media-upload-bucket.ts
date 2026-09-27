/**
 * Copyright Discava Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { Construct } from 'constructs';
import { UploadBucket, UploadBucketProps } from '../../core/upload-bucket.js';

export type LessonMediaUploadBucketProps = Omit<
  UploadBucketProps,
  'runtimeConfigKey'
>;

export class LessonMediaUploadBucket extends UploadBucket {
  constructor(
    scope: Construct,
    id: string,
    props?: LessonMediaUploadBucketProps,
  ) {
    super(scope, id, {
      ...props,
      runtimeConfigKey: 'LessonMediaUploadBucket',
    });
  }
}
