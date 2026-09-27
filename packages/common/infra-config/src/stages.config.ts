/**
 * Copyright Discava Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import type { StagesConfig } from './stages.types.js';

// Custom domains and their ACM certificates are account-specific, so they
// aren't committed here. Set them as <STAGE>_<COMPONENT>_<FIELD> env vars
// instead (see env-overrides.ts); deploy.yml forwards any such variable set
// on the stage's GitHub environment, and scripts/setup-stage.sh prompts for
// them and sets them there. For discava-development, each component
// takes a DISCAVA_DEVELOPMENT_<COMPONENT>_CERTIFICATE_ARN plus:
//
//   APIs (API Gateway; certificate in the stage's region), one domain each:
//     DISCAVA_DEVELOPMENT_CORE_API_DOMAIN_NAME            api.example.com
//     DISCAVA_DEVELOPMENT_INSTRUCTOR_API_DOMAIN_NAME      instructor-api.example.com
//
//   CloudFront (certificate in us-east-1), comma-separated domains:
//     DISCAVA_DEVELOPMENT_STUDENT_PORTAL_DOMAIN_NAMES     example.com,www.example.com
//     DISCAVA_DEVELOPMENT_INSTRUCTOR_PORTAL_DOMAIN_NAMES  instructor.example.com
//     DISCAVA_DEVELOPMENT_ADMIN_PORTAL_DOMAIN_NAMES       admin.example.com
//     DISCAVA_DEVELOPMENT_LESSON_MEDIA_DOMAIN_NAMES       media.example.com
//
// A domain is only applied when its certificate ARN is also set. Portal
// domains are picked up automatically as API CORS origins and Cognito
// callback/logout URLs. DNS records pointing each domain at its API Gateway /
// CloudFront target aren't managed by the stack and need creating separately.
//
// HLS video playback additionally needs a shared parent domain for signed
// cookies, independent of the certificate/domainNames above:
//     DISCAVA_DEVELOPMENT_LESSON_MEDIA_COOKIE_DOMAIN      example.com
export default {
  projects: {
    'packages/infra': {
      stages: {
        // No credentials/region set yet — deploys use your active AWS CLI
        // credentials and CDK_DEFAULT_REGION until these are configured.
        'discava-development': {
          components: {
            identity: { enableWaf: false, enableMfa: false },
            coreApi: { enableWaf: false, enableKmsEncryption: false },
            instructorApi: { enableWaf: false, enableKmsEncryption: false },
            coreTable: {
              enableKmsEncryption: false,
              enableDeletionProtection: false,
            },
            studentPortal: { enableWaf: false, enableKmsEncryption: false },
            instructorPortal: { enableWaf: false, enableKmsEncryption: false },
            adminPortal: { enableWaf: false, enableKmsEncryption: false },
            lessonMedia: {
              enableWaf: false,
              enableKmsEncryption: false,
              retainOnDelete: false,
            },
          },
        },
        'discava-production': {
          components: {
            identity: { enableWaf: true, enableMfa: true },
            coreApi: {
              enableWaf: true,
              enableKmsEncryption: true,
              enableKeyRotation: true,
            },
            instructorApi: {
              enableWaf: true,
              enableKmsEncryption: true,
              enableKeyRotation: true,
            },
            coreTable: {
              enableKmsEncryption: true,
              enableKeyRotation: true,
              enableDeletionProtection: true,
            },
            studentPortal: {
              enableWaf: true,
              enableKmsEncryption: true,
              enableKeyRotation: true,
            },
            instructorPortal: {
              enableWaf: true,
              enableKmsEncryption: true,
              enableKeyRotation: true,
            },
            adminPortal: {
              enableWaf: true,
              enableKmsEncryption: true,
              enableKeyRotation: true,
            },
            lessonMedia: {
              enableWaf: true,
              enableKmsEncryption: true,
              enableKeyRotation: true,
              retainOnDelete: true,
            },
          },
        },
      },
    },
  },
  shared: {
    stages: {
      // Example: shared sandbox stage available to all projects
      // 'sandbox': {
      //   credentials: { type: 'profile', profile: 'sandbox-profile' },
      //   region: 'us-east-1',
      // },
    },
  },
} as const satisfies StagesConfig;
