/**
 * Copyright Discava Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { useContext } from 'react';
import {
  InstructorApiTRPCContext,
  type InstructorApiTRPCContextValue,
} from '../components/InstructorApiClientProvider';

export const useInstructorApi =
  (): InstructorApiTRPCContextValue['optionsProxy'] => {
    const container = useContext(InstructorApiTRPCContext);
    if (!container) {
      throw new Error(
        'useInstructorApi must be used within InstructorApiClientProvider',
      );
    }
    return container.optionsProxy;
  };

export const useInstructorApiClient =
  (): InstructorApiTRPCContextValue['client'] => {
    const container = useContext(InstructorApiTRPCContext);
    if (!container) {
      throw new Error(
        'useInstructorApiClient must be used within InstructorApiClientProvider',
      );
    }
    return container.client;
  };
