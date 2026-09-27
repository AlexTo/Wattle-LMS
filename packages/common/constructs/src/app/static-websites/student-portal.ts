/**
 * Copyright Discava Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { Construct } from 'constructs';
import * as url from 'url';
import { StaticWebsite, StaticWebsiteProps } from '../../core/index.js';

export type StudentPortalProps = Omit<
  StaticWebsiteProps,
  'websiteName' | 'websiteFilePath'
>;

export class StudentPortal extends StaticWebsite {
  constructor(scope: Construct, id: string, props?: StudentPortalProps) {
    super(scope, id, {
      ...props,
      websiteName: 'StudentPortal',
      websiteFilePath: url.fileURLToPath(
        new URL(
          '../../../../../../dist/packages/websites/student-portal/bundle',
          import.meta.url,
        ),
      ),
    });
  }
}
