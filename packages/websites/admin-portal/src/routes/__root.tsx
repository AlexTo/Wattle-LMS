/**
 * Copyright Discava Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';
import AppLayout from '../components/AppLayout';
import { RouterProviderContext } from '../main';

export const Route = createRootRouteWithContext<RouterProviderContext>()({
  component: () => (
    <AppLayout>
      <Outlet />
    </AppLayout>
  ),
});
