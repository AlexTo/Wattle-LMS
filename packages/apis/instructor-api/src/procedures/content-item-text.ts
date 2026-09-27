/**
 * Copyright Discava Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { TRPCError } from '@trpc/server';
import { v7 as uuidv7 } from 'uuid';
import { courseProcedure } from '../init.js';
import {
  getCourseOrThrow,
  initialVisibility,
  requireNotArchived,
} from '../lib/course-lifecycle.js';
import {
  CreateContentItemTextInputSchema,
  CreateContentItemTextOutputSchema,
  type ICreateContentItemTextOutput,
  type IUpdateContentItemTextOutput,
  UpdateContentItemTextInputSchema,
  UpdateContentItemTextOutputSchema,
} from '../schema/index.js';
import { asContentItemOutput } from './content-item-shared.js';

export const createContentItemText = courseProcedure
  .input(CreateContentItemTextInputSchema)
  .output(CreateContentItemTextOutputSchema)
  .mutation(async ({ ctx, input }) => {
    const coreTable = ctx.coreTable!;
    const { courseId, moduleId, lessonId, title, description, body } = input;
    const { sub: currentUser } = ctx.user;

    // Only instructors teaching this specific course may add content to
    // its lessons, not just any member of the instructor group.
    const { data: membership } = await coreTable.entities.courseInstructor
      .get({ courseId, instructorId: currentUser })
      .go();
    if (!membership) {
      throw new TRPCError({ code: 'FORBIDDEN' });
    }

    const { data: lesson } = await coreTable.entities.lesson
      .get({ courseId, moduleId, lessonId })
      .go();
    if (!lesson) {
      throw new TRPCError({ code: 'NOT_FOUND' });
    }
    requireNotArchived(
      lesson,
      'Restore the lesson before adding content to it',
    );
    const course = await getCourseOrThrow(coreTable, courseId);

    // Text items have no upload step (unlike video, whose id is minted by
    // createContentItemVideoUploadUrl), so the id is generated here.
    const contentItemId = uuidv7();

    // New content items append to the end of the lesson. `order` isn't part
    // of any key (content item counts per lesson are small enough to sort
    // client-side), so this is a plain query-and-increment rather than an
    // atomic counter.
    const { data: contentItems } = await coreTable.entities.contentItem.query
      .primary({ courseId, moduleId, lessonId })
      .go();
    const order =
      contentItems.reduce((max, item) => Math.max(max, item.order), 0) + 1;

    const { data: contentItem } = await coreTable.entities.contentItem
      .create({
        contentItemId,
        lessonId,
        moduleId,
        courseId,
        type: 'text',
        title,
        description,
        body,
        order,
        visibility: initialVisibility(course),
      })
      .go();

    return asContentItemOutput<ICreateContentItemTextOutput>(contentItem);
  });

export const updateContentItemText = courseProcedure
  .input(UpdateContentItemTextInputSchema)
  .output(UpdateContentItemTextOutputSchema)
  .mutation(async ({ ctx, input }) => {
    const coreTable = ctx.coreTable!;
    const {
      courseId,
      moduleId,
      lessonId,
      contentItemId,
      title,
      description,
      body,
    } = input;
    const { sub: currentUser } = ctx.user;

    // Only instructors teaching this specific course may edit its lesson
    // content, not just any member of the instructor group.
    const { data: membership } = await coreTable.entities.courseInstructor
      .get({ courseId, instructorId: currentUser })
      .go();
    if (!membership) {
      throw new TRPCError({ code: 'FORBIDDEN' });
    }

    const { data: existing } = await coreTable.entities.contentItem
      .get({ courseId, moduleId, lessonId, contentItemId })
      .go();
    if (!existing) {
      throw new TRPCError({ code: 'NOT_FOUND' });
    }

    // A content item's type is fixed at creation -- there's no supported
    // path to turn a video into a text item.
    if (existing.type !== 'text') {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Content item is type '${existing.type}', not 'text'`,
      });
    }

    const { data: contentItem } = await coreTable.entities.contentItem
      .patch({ courseId, moduleId, lessonId, contentItemId })
      .set({
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description }),
        ...(body !== undefined && { body }),
      })
      .go({ response: 'all_new' });

    return asContentItemOutput<IUpdateContentItemTextOutput>(contentItem);
  });
