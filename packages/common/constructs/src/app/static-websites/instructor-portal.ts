/**
 * Copyright Discava Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { Construct } from 'constructs';
import * as url from 'url';
import { StaticWebsite, StaticWebsiteProps } from '../../core/index.js';

export type InstructorPortalProps = Omit<
  StaticWebsiteProps,
  'websiteName' | 'websiteFilePath'
>;

export class InstructorPortal extends StaticWebsite {
  constructor(scope: Construct, id: string, props?: InstructorPortalProps) {
    super(scope, id, {
      ...props,
      websiteName: 'InstructorPortal',
      websiteFilePath: url.fileURLToPath(
        new URL(
          '../../../../../../dist/packages/websites/instructor-portal/bundle',
          import.meta.url,
        ),
      ),
    });
  }
}
