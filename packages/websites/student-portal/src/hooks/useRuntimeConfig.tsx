/**
 * Copyright Discava Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { useContext } from 'react';
import {
  IRuntimeConfig,
  RuntimeConfigContext,
} from '../components/RuntimeConfig';

export const useRuntimeConfig = (): IRuntimeConfig => {
  const runtimeConfig = useContext(RuntimeConfigContext);

  if (!runtimeConfig) {
    throw new Error(
      'useRuntimeConfig must be used within a RuntimeConfigProvider',
    );
  }

  return runtimeConfig;
};
