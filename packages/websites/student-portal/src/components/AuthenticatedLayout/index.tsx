/**
 * Copyright Discava Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { Input } from '@discava/common-shadcn/components/ui/input';
import { Separator } from '@discava/common-shadcn/components/ui/separator';
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@discava/common-shadcn/components/ui/sidebar';
import { Search } from 'lucide-react';
import * as React from 'react';
import Config from '../../config';
import { AppSidebar } from '../app-sidebar';
import { UserMenu } from '../UserMenu';

const AuthenticatedLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <SidebarProvider
      style={{ '--sidebar-width': '13rem' } as React.CSSProperties}
    >
      <AppSidebar />
      <SidebarInset>
        <header className="supports-backdrop-blur:bg-background/60 sticky top-0 z-10 flex h-16 items-center gap-4 border-b bg-background/80 px-4 backdrop-blur">
          <div className="flex items-center gap-3">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="h-6" />
            <div className="flex items-center gap-2">
              <img
                alt={`${Config.applicationName} logo`}
                className="size-10 rounded-lg border border-border/60 bg-background object-cover shadow-sm"
                src={Config.logo}
              />
              <div className="flex flex-col leading-tight">
                <span className="text-sm font-semibold">
                  {Config.applicationName}
                </span>
              </div>
            </div>
          </div>
          <form
            className="relative ml-auto hidden w-full max-w-md sm:block"
            role="search"
            onSubmit={(event) => event.preventDefault()}
          >
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              aria-label="Search courses and activities"
              placeholder="Search courses and activities"
              className="bg-background/80 pl-9"
            />
          </form>
          <div className="flex items-center gap-3">
            <UserMenu />
          </div>
        </header>
        <div className="flex flex-1 flex-col gap-6 p-6 pt-4">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
};

export default AuthenticatedLayout;
