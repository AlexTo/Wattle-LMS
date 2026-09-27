/**
 * Copyright Discava Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';
import { useAuth } from 'react-oidc-context';
import { Spinner } from '../components/spinner';

export const Route = createFileRoute('/signin')({
  component: RouteComponent,
});

function RouteComponent() {
  const auth = useAuth();
  const navigate = useNavigate();
  // `auth` is a fresh object on every render, so this effect must guard
  // against re-invoking signinRedirect() on each re-render — otherwise a
  // signinRedirect() call that doesn't navigate away (e.g. it rejects
  // because no Cognito domain is configured yet) causes an infinite
  // render loop instead of just failing once.
  const signinAttempted = useRef(false);

  useEffect(() => {
    if (auth.isLoading) {
      return;
    }
    if (auth.isAuthenticated) {
      navigate({ to: '/' });
      return;
    }
    if (!signinAttempted.current) {
      signinAttempted.current = true;
      auth.signinRedirect();
    }
  }, [auth, navigate]);

  return <Spinner />;
}
