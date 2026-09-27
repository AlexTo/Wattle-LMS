/**
 * Copyright Discava Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { Entity } from 'electrodb';
import { getDynamoDBClient, resolveTableName } from '../client.js';

export const createAssignmentEntity = async () =>
  new Entity(
    {
      model: {
        entity: 'assignment',
        version: '1',
        service: 'CoreTable',
      },
      attributes: {
        assignmentId: {
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
        dueAt: {
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
        // List assignments for a course.
        primary: {
          pk: {
            field: 'pk',
            composite: ['courseId'],
          },
          sk: {
            field: 'sk',
            composite: ['assignmentId'],
          },
        },
      },
    },
    { client: getDynamoDBClient(), table: await resolveTableName() },
  );
