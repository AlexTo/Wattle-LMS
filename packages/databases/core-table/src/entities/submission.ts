/**
 * Copyright Discava Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { Entity } from 'electrodb';
import { getDynamoDBClient, resolveTableName } from '../client.js';

export const createSubmissionEntity = async () =>
  new Entity(
    {
      model: {
        entity: 'submission',
        version: '1',
        service: 'CoreTable',
      },
      attributes: {
        assignmentId: {
          type: 'string',
          required: true,
        },
        userId: {
          type: 'string',
          required: true,
        },
        courseId: {
          type: 'string',
          required: true,
        },
        content: {
          type: 'string',
        },
        status: {
          type: ['submitted', 'graded'] as const,
          required: true,
          default: 'submitted',
        },
        grade: {
          type: 'number',
        },
        feedback: {
          type: 'string',
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
        // List submissions for an assignment; get a student's submission
        // for an assignment.
        primary: {
          pk: {
            field: 'pk',
            composite: ['assignmentId'],
          },
          sk: {
            field: 'sk',
            composite: ['userId'],
          },
        },
        // List a student's submissions across courses/assignments.
        byUser: {
          index: 'gsi2pk-gsi2sk-index',
          pk: {
            field: 'gsi2pk',
            composite: ['userId'],
          },
          sk: {
            field: 'gsi2sk',
            composite: ['courseId', 'assignmentId'],
          },
        },
      },
    },
    { client: getDynamoDBClient(), table: await resolveTableName() },
  );
