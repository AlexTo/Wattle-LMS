/**
 * Copyright Discava Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { CreateAWSLambdaContextOptions } from '@trpc/server/adapters/aws-lambda';
import type { APIGatewayProxyEvent } from 'aws-lambda';
import { IAuthContext } from './auth.js';
import { ICoreTableContext } from './core-table.js';
import { ILoggerContext } from './logger.js';
import { IMetricsContext } from './metrics.js';
import { ITracerContext } from './tracer.js';

export * from './auth.js';
export * from './core-table.js';
export * from './error.js';
export * from './logger.js';
export * from './metrics.js';
export * from './tracer.js';

export type IMiddlewareContext =
  CreateAWSLambdaContextOptions<APIGatewayProxyEvent> &
    IAuthContext &
    ICoreTableContext &
    ILoggerContext &
    IMetricsContext &
    ITracerContext;
