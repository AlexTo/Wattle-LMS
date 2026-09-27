/**
 * Copyright Discava Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Construct } from 'constructs';
import * as url from 'url';
import { StaticWebsite, StaticWebsiteProps } from '../../core/index.js';

export type AdminPortalProps = Omit<
  StaticWebsiteProps,
  'websiteName' | 'websiteFilePath'
>;

export class AdminPortal extends StaticWebsite {
  constructor(scope: Construct, id: string, props?: AdminPortalProps) {
    super(scope, id, {
      ...props,
      websiteName: 'AdminPortal',
      websiteFilePath: url.fileURLToPath(
        new URL(
          '../../../../../../dist/packages/websites/admin-portal/bundle',
          import.meta.url,
        ),
      ),
    });
  }
}
