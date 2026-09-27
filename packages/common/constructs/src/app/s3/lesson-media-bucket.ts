/**
 * Copyright Discava Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { Construct } from 'constructs';
import { MediaBucket, MediaBucketProps } from '../../core/media-bucket.js';

export type LessonMediaBucketProps = Omit<MediaBucketProps, 'runtimeConfigKey'>;

export class LessonMediaBucket extends MediaBucket {
  constructor(scope: Construct, id: string, props?: LessonMediaBucketProps) {
    super(scope, id, {
      ...props,
      runtimeConfigKey: 'LessonMediaBucket',
    });
  }
}
