/**
 * Copyright Discava Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button } from '@discava/common-shadcn/components/ui/button';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useAuth } from 'react-oidc-context';
import Config from '../../config';
import { UserMenu } from '../UserMenu';

const PublicLayout = ({ children }: { children: ReactNode }) => {
  const { isAuthenticated } = useAuth();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-50 flex items-center justify-between border-b bg-background/90 px-6 py-3 backdrop-blur lg:px-8">
        <Link to="/" className="flex items-center gap-2">
          <img
            alt={`${Config.applicationName} logo`}
            className="size-10 rounded-lg border border-border/60 bg-background object-cover shadow-sm"
            src={Config.logo}
          />
          <span className="text-sm font-semibold">
            {Config.applicationName}
          </span>
        </Link>
        {isAuthenticated ? (
          <div className="flex items-center gap-3">
            <Button variant="outline" asChild>
              <Link to="/dashboard">Dashboard</Link>
            </Button>
            <UserMenu />
          </div>
        ) : (
          <Button asChild>
            <Link to="/signin">Sign In</Link>
          </Button>
        )}
      </header>
      <main className="flex flex-1 flex-col items-center justify-center text-center">
        {children}
      </main>
    </div>
  );
};

export default PublicLayout;
