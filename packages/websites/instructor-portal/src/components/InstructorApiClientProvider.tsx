/**
 * Copyright Discava Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { AppRouter } from '@discava/instructor-api';
import { useQueryClient } from '@tanstack/react-query';
import {
  createTRPCClient,
  httpLink,
  httpSubscriptionLink,
  splitLink,
  TRPCClient,
} from '@trpc/client';
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query';
import { EventSourcePolyfill } from 'event-source-polyfill';
import { createContext, FC, PropsWithChildren, useMemo } from 'react';
import { useAuth } from 'react-oidc-context';
import { useRuntimeConfig } from '../hooks/useRuntimeConfig';

export interface InstructorApiTRPCContextValue {
  optionsProxy: ReturnType<typeof createTRPCOptionsProxy<AppRouter>>;
  client: TRPCClient<AppRouter>;
}

export const InstructorApiTRPCContext =
  createContext<InstructorApiTRPCContextValue | null>(null);

export const InstructorApiClientProvider: FC<PropsWithChildren> = ({
  children,
}) => {
  const queryClient = useQueryClient();
  const runtimeConfig = useRuntimeConfig();
  const apiUrl = runtimeConfig.apis.InstructorApi;
  const auth = useAuth();
  const user = auth?.user;

  const container = useMemo<InstructorApiTRPCContextValue>(() => {
    const client = createTRPCClient<AppRouter>({
      links: [
        splitLink({
          condition: (op) => op.type === 'subscription',
          true: httpSubscriptionLink({
            url: apiUrl,
            EventSource: EventSourcePolyfill,
            eventSourceOptions: async ({ op }) => {
              return {
                headers: {
                  Authorization: `Bearer ${user?.access_token}`,
                },
              };
            },
          }),
          false: httpLink({
            url: apiUrl,
            headers: {
              Authorization: `Bearer ${user?.access_token}`,
            },
            // createVideoUrl sets CloudFront signed cookies cross-subdomain
            // (instructor-api's own domain) for HLS playback -- without
            // `credentials: 'include'`, the browser won't store cross-origin
            // Set-Cookie response headers at all.
            fetch: (url, options) =>
              fetch(url, { ...options, credentials: 'include' }),
          }),
        }),
      ],
    });

    const optionsProxy = createTRPCOptionsProxy<AppRouter>({
      client,
      queryClient,
    });

    return { optionsProxy, client };
  }, [apiUrl, queryClient, user]);

  return (
    <InstructorApiTRPCContext.Provider value={container}>
      {children}
    </InstructorApiTRPCContext.Provider>
  );
};

export default InstructorApiClientProvider;
