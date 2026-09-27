/**
 * Copyright Wattle LMS Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { defineConfig } from 'astro/config';

import starlight from '@astrojs/starlight';
import starlightBlog from 'starlight-blog';

const basePath = process.env.DOCS_BASE_PATH || '/wattle-lms';

// https://astro.build/config
export default defineConfig({
  site: 'https://alexto.github.io',
  base: basePath,
  outDir: './dist',
  // Redirect the root URL to the default locale so visitors land on localised content.
  redirects: {
    '/': `${basePath}/en`,
  },
  integrations: [
    starlight({
      title: 'docs',
      social: [],
      tableOfContents: {
        minHeadingLevel: 2,
        maxHeadingLevel: 4,
      },
      defaultLocale: 'en',
      locales: {
        en: {
          label: 'English',
        },
        jp: {
          label: '日本語',
        },
        ko: {
          label: '한국어',
        },
        es: {
          label: 'Español',
        },
        pt: {
          label: 'Português',
        },
        fr: {
          label: 'Français',
        },
        it: {
          label: 'Italiano',
        },
        zh: {
          label: '中文',
        },
        vi: {
          label: 'Tiếng Việt',
        },
      },
      sidebar: [
        {
          label: 'Design',
          items: [{ autogenerate: { directory: 'design' } }],
        },
      ],
      customCss: ['./src/styles/custom.css'],
      plugins: [
        starlightBlog({
          authors: {
            default: {
              name: 'Docs Author',
              title: 'Maintainer',
            },
          },
        }),
      ],
    }),
  ],
});
