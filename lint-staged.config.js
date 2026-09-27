/**
 * Copyright Discava Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
export default {
  'packages/**/*.{ts,tsx,js,jsx,json,css,scss}': [
    'biome check --write --no-errors-on-unmatched',
  ],
  '*.{js,json}': ['biome check --write --no-errors-on-unmatched'],
};
