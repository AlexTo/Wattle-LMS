/**
 * Copyright Discava Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { TRPCError } from '@trpc/server';
import { v7 as uuidv7 } from 'uuid';
import { courseProcedure } from '../init.js';
import { bestEffortCancelTranscodeJobs } from '../lib/mediaconvert-client.js';
import { bestEffortDeleteContentItemVideos } from '../lib/s3-client.js';
import {
  CreateModuleInputSchema,
  CreateModuleOutputSchema,
  DeleteModuleInputSchema,
  DeleteModuleOutputSchema,
  UpdateModuleInputSchema,
  UpdateModuleOutputSchema,
} from '../schema/index.js';

export const createModule = courseProcedure
  .input(CreateModuleInputSchema)
  .output(CreateModuleOutputSchema)
  .mutation(async ({ ctx, input }) => {
    const coreTable = ctx.coreTable!;
    const { courseId, title, description } = input;
    const { sub: currentUser } = ctx.user;

    // Only instructors teaching this specific course may add modules to it,
    // not just any member of the instructor group.
    const { data: membership } = await coreTable.entities.courseInstructor
      .get({ courseId, instructorId: currentUser })
      .go();
    if (!membership) {
      throw new TRPCError({ code: 'FORBIDDEN' });
    }

    // New modules append to the end of the course. `order` isn't part of any
    // key (module counts per course are small enough to sort client-side),
    // so this is a plain query-and-increment rather than an atomic counter.
    const { data: modules } = await coreTable.entities.module.query
      .primary({ courseId })
      .go();
    const order =
      modules.reduce((max, module) => Math.max(max, module.order), 0) + 1;

    const { data: module } = await coreTable.entities.module
      .create({ moduleId: uuidv7(), courseId, title, description, order })
      .go();

    return module;
  });

export const updateModule = courseProcedure
  .input(UpdateModuleInputSchema)
  .output(UpdateModuleOutputSchema)
  .mutation(async ({ ctx, input }) => {
    const coreTable = ctx.coreTable!;
    const { courseId, moduleId, title, description, order } = input;
    const { sub: currentUser } = ctx.user;

    // Only instructors teaching this specific course may edit its modules,
    // not just any member of the instructor group.
    const { data: membership } = await coreTable.entities.courseInstructor
      .get({ courseId, instructorId: currentUser })
      .go();
    if (!membership) {
      throw new TRPCError({ code: 'FORBIDDEN' });
    }

    const { data: existing } = await coreTable.entities.module
      .get({ courseId, moduleId })
      .go();
    if (!existing) {
      throw new TRPCError({ code: 'NOT_FOUND' });
    }

    const { data: module } = await coreTable.entities.module
      .patch({ courseId, moduleId })
      .set({
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description }),
        ...(order !== undefined && { order }),
      })
      .go({ response: 'all_new' });

    return module;
  });

export const deleteModule = courseProcedure
  .input(DeleteModuleInputSchema)
  .output(DeleteModuleOutputSchema)
  .mutation(async ({ ctx, input }) => {
    const coreTable = ctx.coreTable!;
    const { courseId, moduleId } = input;
    const { sub: currentUser } = ctx.user;

    // Only instructors teaching this specific course may delete its
    // modules, not just any member of the instructor group.
    const { data: membership } = await coreTable.entities.courseInstructor
      .get({ courseId, instructorId: currentUser })
      .go();
    if (!membership) {
      throw new TRPCError({ code: 'FORBIDDEN' });
    }

    const { data: existing } = await coreTable.entities.module
      .get({ courseId, moduleId })
      .go();
    if (!existing) {
      throw new TRPCError({ code: 'NOT_FOUND' });
    }

    // Lessons -- and their content items -- have no lifecycle independent
    // of their module, and there's no way to reach one once its module is
    // gone, so deleting a module cascades to every lesson and content item
    // under it. Content items share the same sk prefix as their parent
    // lesson (moduleId, then lessonId, then contentItemId), so querying by
    // just courseId+moduleId returns every content item across every
    // lesson in the module in one call. Everything is deleted
    // transactionally so a failure partway through can't leave an orphaned
    // lesson or content item referencing a module that no longer exists.
    const { data: lessons } = await coreTable.entities.lesson.query
      .primary({ courseId, moduleId })
      .go();
    const { data: contentItems } = await coreTable.entities.contentItem.query
      .primary({ courseId, moduleId })
      .go();

    // DynamoDB caps a single transaction at 100 items; nothing currently
    // limits how many lessons/content items a module can hold, so a module
    // this large can't be deleted in one transactional cascade.
    if (1 + lessons.length + contentItems.length > 100) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message:
          'Module has too many lessons or content items to delete in a single operation; delete some first',
      });
    }

    // Content item deletes are conditioned on updatedAt (bumped by every
    // write, video or text -- see the contentItem entity's `watch: '*'`
    // on that attribute) still matching what was just queried above --
    // see the equivalent comment in lesson.ts's deleteLesson for why:
    // a content item changing between the query and this transaction,
    // most notably a transcode completing and publishing its HLS output,
    // would otherwise still be deleted while cleanup below acted on a
    // stale snapshot of it.
    const { canceled, data: transactionResults } = await coreTable.transaction
      .write((entities) => [
        entities.module.delete({ courseId, moduleId }).commit(),
        ...lessons.map(({ lessonId }) =>
          entities.lesson.delete({ courseId, moduleId, lessonId }).commit(),
        ),
        ...contentItems.map((item) =>
          entities.contentItem
            .delete({
              courseId,
              moduleId,
              lessonId: item.lessonId,
              contentItemId: item.contentItemId,
            })
            .where((attr, op) => op.eq(attr.updatedAt, item.updatedAt))
            .commit(),
        ),
      ])
      .go();

    if (canceled) {
      const staleContentItem = transactionResults?.some(
        (result) => result?.code === 'ConditionalCheckFailed',
      );
      throw new TRPCError({
        code: staleContentItem ? 'CONFLICT' : 'INTERNAL_SERVER_ERROR',
        message: staleContentItem
          ? 'A content item in this module changed while it was being deleted; retry the delete'
          : 'Failed to delete module',
      });
    }

    // Best-effort: the DynamoDB records are the source of truth for the
    // module's content, so a failure to remove the underlying S3 objects
    // is logged rather than thrown. Only video content items have an S3
    // object to clean up (and possibly a still-running transcode job).
    const videoContentItems = contentItems.filter(
      (item) => item.type === 'video',
    );
    await bestEffortCancelTranscodeJobs(ctx.logger, videoContentItems);
    await bestEffortDeleteContentItemVideos(ctx.logger, videoContentItems);

    // DynamoDB transactions don't return the deleted attributes, but we
    // already fetched the module's pre-delete state above for the
    // existence check.
    return existing;
  });
