/**
 * Copyright Discava Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import AppLayout from '../../components/AppLayout';

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: ({ context }) => {
    // Auth is bypassed in local-dev mode (no cognitoProps configured), matching
    // the same bypass CognitoAuth applies before the router ever mounts.
    if (context.runtimeConfig?.cognitoProps && !context.auth?.isAuthenticated) {
      throw redirect({ to: '/signin' });
    }
  },
  component: () => (
    <AppLayout>
      <Outlet />
    </AppLayout>
  ),
});
