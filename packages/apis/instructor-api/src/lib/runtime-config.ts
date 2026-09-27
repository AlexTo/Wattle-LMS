/**
 * Copyright Discava Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { getAppConfig } from '@aws-lambda-powertools/parameters/appconfig';

/**
 * Resolves and caches a single key within a RuntimeConfig/AppConfig
 * namespace (e.g. namespace `s3`, key `LessonMediaBucket`). Shared by every
 * `lib/*-client.ts` resolver in this package.
 */
export const resolveAppConfigValue = (() => {
  const cache = new Map<string, unknown>();
  return async <T>(namespace: string, key: string): Promise<T> => {
    const cacheKey = `${namespace}.${key}`;
    const cached = cache.get(cacheKey);
    if (cached !== undefined) {
      return cached as T;
    }
    const appId = process.env.RUNTIME_CONFIG_APP_ID;
    if (!appId) {
      throw new Error('RUNTIME_CONFIG_APP_ID environment variable is not set');
    }
    const config = await getAppConfig<{ [k: string]: T | undefined }>(
      namespace,
      {
        application: appId,
        environment: 'default',
        transform: 'json',
      },
    );
    const value = config?.[key];
    if (!value) {
      throw new Error(
        `Could not resolve ${namespace}.${key} from runtime config`,
      );
    }
    cache.set(cacheKey, value);
    return value;
  };
})();
