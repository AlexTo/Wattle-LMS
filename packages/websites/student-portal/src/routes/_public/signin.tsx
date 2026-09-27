/**
 * Copyright Discava Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useAuth } from 'react-oidc-context';
import { Spinner } from '../../components/spinner';

export const Route = createFileRoute('/_public/signin')({
  component: RouteComponent,
});

function RouteComponent() {
  const auth = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (auth.isLoading) {
      return;
    }
    if (auth.isAuthenticated) {
      navigate({ to: '/dashboard' });
    } else {
      auth.signinRedirect();
    }
  }, [auth, navigate]);

  return <Spinner />;
}
