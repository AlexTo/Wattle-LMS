/**
 * Copyright Discava Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { RouterProvider } from '@tanstack/react-router';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { useAuth } from 'react-oidc-context';
import CognitoAuth from './components/CognitoAuth';
import CoreApiClientProvider from './components/CoreApiClientProvider';
import QueryClientProvider from './components/QueryClientProvider';
import RuntimeConfigProvider from './components/RuntimeConfig';
import { useRuntimeConfig } from './hooks/useRuntimeConfig';
import { router } from './router';
import './styles.css';

const App = () => {
  const auth = useAuth();
  const runtimeConfig = useRuntimeConfig();
  return <RouterProvider router={router} context={{ runtimeConfig, auth }} />;
};

const root = document.getElementById('root');
root &&
  createRoot(root).render(
    <React.StrictMode>
      <RuntimeConfigProvider>
        <CognitoAuth>
          <QueryClientProvider>
            <CoreApiClientProvider>
              <App />
            </CoreApiClientProvider>
          </QueryClientProvider>
        </CognitoAuth>
      </RuntimeConfigProvider>
    </React.StrictMode>,
  );
