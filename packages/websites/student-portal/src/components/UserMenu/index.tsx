/**
 * Copyright Discava Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { useEffect, useRef, useState } from 'react';
import { useAuth } from 'react-oidc-context';
import { getUserIdentity } from './user-profile';

export const UserMenu = () => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as any)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);
  const auth = useAuth();
  const { user, removeUser } = auth;
  const { displayName, initials } = getUserIdentity(user?.profile);

  // Cognito's `end_session_endpoint` doesn't honour the OIDC-standard
  // `post_logout_redirect_uri` param that `signoutRedirect()` sends - it
  // requires its own `logout_uri` param instead, so we build the redirect
  // manually from the discovered endpoint.
  const handleSignOut = async () => {
    setMenuOpen(false);
    let endSessionEndpoint: string | undefined;
    try {
      const metadataUrl = `${auth.settings.authority}/.well-known/openid-configuration`;
      const metadata = await (await fetch(metadataUrl)).json();
      endSessionEndpoint = metadata.end_session_endpoint;
    } catch {
      // fall through to a local-only sign out below
    }
    await removeUser();
    if (endSessionEndpoint) {
      const logoutUrl = new URL(endSessionEndpoint);
      logoutUrl.searchParams.set('client_id', auth.settings.client_id);
      logoutUrl.searchParams.set('logout_uri', window.location.origin);
      window.location.href = logoutUrl.toString();
    } else {
      window.location.href = window.location.origin;
    }
  };

  return (
    <div className="relative flex items-center gap-3" ref={menuRef}>
      <button
        type="button"
        onClick={() => setMenuOpen((open) => !open)}
        className="focus-visible:ring-ring/60 bg-muted text-muted-foreground flex size-10 items-center justify-center rounded-full border border-border/60 font-semibold shadow-sm outline-none transition hover:bg-muted/80 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background cursor-pointer"
        aria-label="Open user menu"
        aria-expanded={menuOpen}
      >
        {initials}
      </button>
      {menuOpen && (
        <div className="bg-popover text-popover-foreground absolute right-0 top-12 w-36 overflow-hidden rounded-md border shadow-md">
          <div className="px-3 py-2 text-sm font-semibold">
            Hi, {displayName}!
          </div>
          <div className="bg-border/70 h-px w-full" role="separator" />
          <button
            type="button"
            className="hover:bg-muted w-full px-3 py-2 text-left text-sm cursor-pointer"
            onClick={handleSignOut}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
};
