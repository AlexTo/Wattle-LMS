/**
 * Copyright Discava Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { createFileRoute, Outlet } from '@tanstack/react-router';
import PublicLayout from '../components/PublicLayout';

export const Route = createFileRoute('/_public')({
  component: () => (
    <PublicLayout>
      <Outlet />
    </PublicLayout>
  ),
});
