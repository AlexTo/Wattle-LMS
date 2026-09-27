/**
 * Copyright Discava Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';
import { RouterProviderContext } from '../router';

export const Route = createRootRouteWithContext<RouterProviderContext>()({
  component: () => <Outlet />,
});
