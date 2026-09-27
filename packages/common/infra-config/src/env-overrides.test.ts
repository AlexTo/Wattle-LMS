/**
 * Copyright Discava Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { afterEach, describe, expect, it } from 'vitest';
import { applyEnvOverrides } from './env-overrides.js';
import type { StageConfig } from './stages.types.js';

const STAGE = 'discava-test-stage';

const ENV_KEYS = [
  'DISCAVA_TEST_STAGE_REGION',
  'DISCAVA_TEST_STAGE_ACCOUNT',
  'DISCAVA_TEST_STAGE_STUDENT_PORTAL_ENABLE_WAF',
  'DISCAVA_TEST_STAGE_STUDENT_PORTAL_DOMAIN_NAMES',
  'DISCAVA_TEST_STAGE_STUDENT_PORTAL_CERTIFICATE_ARN',
  'DISCAVA_TEST_STAGE_CORE_API_ENABLE_WAF',
  'DISCAVA_TEST_STAGE_CORE_API_DOMAIN_NAME',
  'DISCAVA_TEST_STAGE_CORE_API_CERTIFICATE_ARN',
  'DISCAVA_TEST_STAGE_INSTRUCTOR_PORTAL_DOMAIN_NAMES',
  'DISCAVA_TEST_STAGE_ADMIN_PORTAL_CERTIFICATE_ARN',
  'DISCAVA_TEST_STAGE_LESSON_MEDIA_DOMAIN_NAMES',
  'DISCAVA_TEST_STAGE_UNKNOWN_FIELD',
];

afterEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
});

describe('applyEnvOverrides', () => {
  it('returns base config unchanged when no override env vars are set', () => {
    const base: StageConfig = {
      region: 'ap-southeast-2',
      components: { studentPortal: { enableWaf: true } },
    };

    expect(applyEnvOverrides(STAGE, base)).toEqual(base);
  });

  it('ignores unrelated env vars', () => {
    process.env.DISCAVA_TEST_STAGE_UNKNOWN_FIELD = 'true';
    const base: StageConfig = {};

    expect(applyEnvOverrides(STAGE, base)).toEqual({});
  });

  it('overrides a boolean component field, taking priority over the base value', () => {
    process.env.DISCAVA_TEST_STAGE_STUDENT_PORTAL_ENABLE_WAF = 'false';
    const base: StageConfig = {
      components: { studentPortal: { enableWaf: true } },
    };

    expect(applyEnvOverrides(STAGE, base)).toEqual({
      components: { studentPortal: { enableWaf: false } },
    });
  });

  it('throws a clear error for an invalid boolean value', () => {
    process.env.DISCAVA_TEST_STAGE_CORE_API_ENABLE_WAF = 'nope';

    expect(() => applyEnvOverrides(STAGE, {})).toThrow(
      /DISCAVA_TEST_STAGE_CORE_API_ENABLE_WAF/,
    );
  });

  it('overrides a string[] field as a comma-separated, trimmed list', () => {
    process.env.DISCAVA_TEST_STAGE_STUDENT_PORTAL_DOMAIN_NAMES =
      'learn.example.com, www.learn.example.com ,,';

    expect(applyEnvOverrides(STAGE, {})).toEqual({
      components: {
        studentPortal: {
          domainNames: ['learn.example.com', 'www.learn.example.com'],
        },
      },
    });
  });

  it('overrides a string field', () => {
    const arn = 'arn:aws:acm:us-east-1:123456789012:certificate/abc-123';
    process.env.DISCAVA_TEST_STAGE_STUDENT_PORTAL_CERTIFICATE_ARN = arn;

    expect(applyEnvOverrides(STAGE, {})).toEqual({
      components: { studentPortal: { certificateArn: arn } },
    });
  });

  it('overrides top-level region and account', () => {
    process.env.DISCAVA_TEST_STAGE_REGION = 'us-east-1';
    process.env.DISCAVA_TEST_STAGE_ACCOUNT = 'test-account-id';

    expect(applyEnvOverrides(STAGE, {})).toEqual({
      region: 'us-east-1',
      account: 'test-account-id',
    });
  });

  it('merges multiple field overrides for the same component alongside unrelated base fields', () => {
    process.env.DISCAVA_TEST_STAGE_STUDENT_PORTAL_ENABLE_WAF = 'false';
    process.env.DISCAVA_TEST_STAGE_STUDENT_PORTAL_CERTIFICATE_ARN =
      'arn:aws:acm:us-east-1:123456789012:certificate/abc';
    const base: StageConfig = {
      components: {
        studentPortal: { enableWaf: true, enableKmsEncryption: true },
        coreApi: { enableWaf: true },
      },
    };

    expect(applyEnvOverrides(STAGE, base)).toEqual({
      components: {
        studentPortal: {
          enableWaf: false,
          enableKmsEncryption: true,
          certificateArn: 'arn:aws:acm:us-east-1:123456789012:certificate/abc',
        },
        coreApi: { enableWaf: true },
      },
    });
  });

  it('overrides the singular domainName/certificateArn fields on an API component', () => {
    process.env.DISCAVA_TEST_STAGE_CORE_API_DOMAIN_NAME = 'api.example.com';
    process.env.DISCAVA_TEST_STAGE_CORE_API_CERTIFICATE_ARN =
      'arn:aws:acm:ap-southeast-2:123456789012:certificate/abc';

    expect(applyEnvOverrides(STAGE, {})).toEqual({
      components: {
        coreApi: {
          domainName: 'api.example.com',
          certificateArn:
            'arn:aws:acm:ap-southeast-2:123456789012:certificate/abc',
        },
      },
    });
  });

  it('overrides domain/certificate fields on the instructor/admin portals and lesson media bucket', () => {
    process.env.DISCAVA_TEST_STAGE_INSTRUCTOR_PORTAL_DOMAIN_NAMES =
      'instruct.example.com';
    process.env.DISCAVA_TEST_STAGE_ADMIN_PORTAL_CERTIFICATE_ARN =
      'arn:aws:acm:us-east-1:123456789012:certificate/def';
    process.env.DISCAVA_TEST_STAGE_LESSON_MEDIA_DOMAIN_NAMES =
      'media.example.com';

    expect(applyEnvOverrides(STAGE, {})).toEqual({
      components: {
        instructorPortal: { domainNames: ['instruct.example.com'] },
        adminPortal: {
          certificateArn: 'arn:aws:acm:us-east-1:123456789012:certificate/def',
        },
        lessonMedia: { domainNames: ['media.example.com'] },
      },
    });
  });
});
