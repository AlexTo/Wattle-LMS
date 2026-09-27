/**
 * Copyright Discava Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { createTRPCClient, HTTPLinkOptions, httpLink } from '@trpc/client';
import { AppRouter } from '../router.js';

export interface CoreApiClientConfig {
  readonly url: string;
  readonly token: string;
}

export const createCoreApiClient = (config: CoreApiClientConfig) => {
  const linkOptions: HTTPLinkOptions<any> = {
    url: config.url,
    headers: {
      Authorization: `Bearer ${config.token}`,
    },
  };
  return createTRPCClient<AppRouter>({
    links: [httpLink(linkOptions)],
  });
};
