/**
 * Copyright Discava Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { Entity } from 'electrodb';
import { getDynamoDBClient, resolveTableName } from '../client.js';

// Shares its pk with Course and Module (COURSE#<courseId>) via the
// `curriculum` collection (../service.ts); sk is prefixed with the parent
// module id so a module's lessons are a contiguous range.
export const createLessonEntity = async () =>
  new Entity(
    {
      model: {
        entity: 'lesson',
        version: '1',
        service: 'CoreTable',
      },
      attributes: {
        lessonId: {
          type: 'string',
          required: true,
        },
        moduleId: {
          type: 'string',
          required: true,
        },
        courseId: {
          type: 'string',
          required: true,
        },
        title: {
          type: 'string',
          required: true,
        },
        description: {
          type: 'string',
        },
        // Sequencing within the module. Not part of any key: lesson counts
        // per module are small enough to sort client-side after fetch.
        order: {
          type: 'number',
          required: true,
        },
        createdAt: {
          type: 'string',
          required: true,
          default: () => new Date().toISOString(),
          readOnly: true,
        },
        updatedAt: {
          type: 'string',
          required: true,
          default: () => new Date().toISOString(),
          watch: '*',
          set: () => new Date().toISOString(),
        },
      },
      indexes: {
        primary: {
          collection: 'curriculum',
          pk: {
            field: 'pk',
            composite: ['courseId'],
          },
          sk: {
            field: 'sk',
            composite: ['moduleId', 'lessonId'],
          },
        },
      },
    },
    { client: getDynamoDBClient(), table: await resolveTableName() },
  );
