/**
 * Copyright Discava Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { useContext } from 'react';
import {
  CoreApiTRPCContext,
  type CoreApiTRPCContextValue,
} from '../components/CoreApiClientProvider';

export const useCoreApi = (): CoreApiTRPCContextValue['optionsProxy'] => {
  const container = useContext(CoreApiTRPCContext);
  if (!container) {
    throw new Error('useCoreApi must be used within CoreApiClientProvider');
  }
  return container.optionsProxy;
};

export const useCoreApiClient = (): CoreApiTRPCContextValue['client'] => {
  const container = useContext(CoreApiTRPCContext);
  if (!container) {
    throw new Error(
      'useCoreApiClient must be used within CoreApiClientProvider',
    );
  }
  return container.client;
};
