/**
 * Copyright Discava Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { AwsNxPluginConfig } from '@aws/nx-plugin';
import {
  DEFAULT_LICENSE_ALLOWLIST,
  npmCollector,
} from '@aws/nx-plugin/sdk/license';

export default {
  iac: { provider: 'cdk' },
  containers: { engine: 'docker' },
  packageManager: { catalogs: true },
  license: {
    dependencies: {
      allow: DEFAULT_LICENSE_ALLOWLIST,
      collectors: [npmCollector()],
      exceptions: [],
    },
    source: {
      spdx: 'Apache-2.0',
      copyrightHolder: 'Discava Contributors',
      header: {
        content: {
          lines: [
            'Copyright Discava Contributors. All Rights Reserved.',
            'SPDX-License-Identifier: Apache-2.0',
          ],
        },
        format: {
          '**/*.{js,ts,jsx,tsx,mjs,mts}': {
            blockStart: '/**',
            lineStart: ' * ',
            blockEnd: ' */',
          },
          '**/*.{py,sh,tf}': {
            blockStart: '#',
            lineStart: '# ',
            blockEnd: '#',
          },
          '**/*.css': {
            blockStart: '/*',
            blockEnd: '*/',
          },
        },
        exclude: [
          '**/*.gen.*',
          // Translated/generated documentation content, not source code
          'docs/src/content/docs/**',
          // Astro requires the `---` frontmatter fence to be the first thing
          // in the file, so a leading header comment breaks compilation
          '**/*.astro',
        ],
      },
    },
  },
} satisfies AwsNxPluginConfig;
