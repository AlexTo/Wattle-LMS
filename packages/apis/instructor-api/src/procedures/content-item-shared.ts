/**
 * Copyright Discava Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Logger } from '@aws-lambda-powertools/logger';
import { TRPCError } from '@trpc/server';
import { courseProcedure } from '../init.js';
import {
  getCourseOrThrow,
  isDraftCourse,
  requireAncestorsNotArchived,
  requireCourseInstructor,
  requireNotArchived,
} from '../lib/course-lifecycle.js';
import {
  bestEffortCancelTranscodeJobs,
  type ICancelableVideoContentItem,
} from '../lib/mediaconvert-client.js';
import {
  bestEffortDeleteContentItemVideos,
  type IDeletableVideoContentItem,
} from '../lib/s3-client.js';
import type { ICoreTableContext } from '../middleware/core-table.js';
import {
  DeleteContentItemInputSchema,
  DeleteContentItemOutputSchema,
  DeleteContentItemPermanentlyInputSchema,
  DeleteContentItemPermanentlyOutputSchema,
  HideContentItemInputSchema,
  HideContentItemOutputSchema,
  type IDeleteContentItemOutput,
  type IDeleteContentItemPermanentlyOutput,
  type IHideContentItemOutput,
  type IPublishContentItemOutput,
  type IRestoreContentItemOutput,
  PublishContentItemInputSchema,
  PublishContentItemOutputSchema,
  RestoreContentItemInputSchema,
  RestoreContentItemOutputSchema,
} from '../schema/index.js';

type CoreTable = NonNullable<ICoreTableContext['coreTable']>;

interface ContentItemKey {
  courseId: string;
  moduleId: string;
  lessonId: string;
  contentItemId: string;
}

// ElectroDB has no native discriminated-attribute support, so a contentItem
// record's inferred type is flat (every type's attributes present as
// optional alongside `type` itself) rather than a proper union keyed on
// `type`. These casts bridge that gap to the discriminated-union API types
// -- safe because each cast site has already checked/branched on `type` (or,
// for the type-agnostic procedures below, is just passing through whatever
// record it read or wrote). Shared across every content-item-<type>.ts
// procedures file.
export const asContentItemOutput = <T>(contentItem: unknown) =>
  contentItem as T;

// A DynamoDB conditional write whose condition didn't hold, as opposed to
// any other failure.
const isConditionalCheckFailed = (error: unknown): boolean =>
  error instanceof Error &&
  'cause' in error &&
  error.cause instanceof Error &&
  error.cause.name === 'ConditionalCheckFailedException';

const getContentItemOrThrow = async (
  coreTable: CoreTable,
  key: ContentItemKey,
) => {
  const { data: contentItem } = await coreTable.entities.contentItem
    .get(key)
    .go();
  if (!contentItem) {
    throw new TRPCError({ code: 'NOT_FOUND' });
  }
  return contentItem;
};

// Removes the record for good, then its external storage. Uses the record
// DeleteItem actually removed (response: 'all_old'), not an earlier read -- a
// concurrent replacement could have landed between the two, and cleaning up
// based on stale state would cancel/delete the wrong job and orphan the real
// one.
const cleanUpDeletedContentItem = async (
  logger: Logger | undefined,
  contentItem: ICancelableVideoContentItem &
    IDeletableVideoContentItem & { type: string; s3Key?: string },
) => {
  if (contentItem.type === 'video') {
    // A still-transcoding job has nothing left to report to once its
    // content item is gone -- cancel it so it doesn't keep running only to
    // leave an orphaned HLS output with no record pointing at it.
    await bestEffortCancelTranscodeJobs(logger, [contentItem]);
    if (contentItem.s3Key) {
      await bestEffortDeleteContentItemVideos(logger, [contentItem]);
    }
  }
};

// Type-agnostic: works the same for every content item type (video, text,
// and whatever else lands here -- quiz, image, etc.), only branching to
// clean up a type's own external storage (e.g. video's S3 object) where
// that type has any.
//
// In a draft course this deletes the item for good. In any other course it
// archives the item instead, keeping it and every student's data for it
// restorable; see deleteContentItemPermanently for removing an archived item
// for good.
export const deleteContentItem = courseProcedure
  .input(DeleteContentItemInputSchema)
  .output(DeleteContentItemOutputSchema)
  .mutation(async ({ ctx, input }) => {
    const coreTable = ctx.coreTable!;
    const { courseId, moduleId, lessonId, contentItemId } = input;
    const key = { courseId, moduleId, lessonId, contentItemId };

    await requireCourseInstructor(coreTable, courseId, ctx.user.sub);
    const existing = await getContentItemOrThrow(coreTable, key);
    const course = await getCourseOrThrow(coreTable, courseId);

    if (isDraftCourse(course)) {
      const { data: contentItem } = await coreTable.entities.contentItem
        .delete(key)
        .go({ response: 'all_old' });
      if (!contentItem) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to delete content item',
        });
      }
      await cleanUpDeletedContentItem(ctx.logger, contentItem);
      return asContentItemOutput<IDeleteContentItemOutput>(contentItem);
    }

    // Already archived: archiving again is a no-op, so a retried request
    // doesn't move archivedAt.
    if (existing.archivedAt) {
      return asContentItemOutput<IDeleteContentItemOutput>(existing);
    }

    // Archiving keeps a video's S3 objects and any running transcode: the
    // item can be restored.
    const { data: contentItem } = await coreTable.entities.contentItem
      .patch(key)
      .set({ archivedAt: new Date().toISOString() })
      .go({ response: 'all_new' });

    return asContentItemOutput<IDeleteContentItemOutput>(contentItem);
  });

// Students still don't see the item until its lesson and module are visible
// too.
export const publishContentItem = courseProcedure
  .input(PublishContentItemInputSchema)
  .output(PublishContentItemOutputSchema)
  .mutation(async ({ ctx, input }) => {
    const coreTable = ctx.coreTable!;
    const { courseId, moduleId, lessonId, contentItemId } = input;
    const key = { courseId, moduleId, lessonId, contentItemId };

    await requireCourseInstructor(coreTable, courseId, ctx.user.sub);
    const existing = await getContentItemOrThrow(coreTable, key);
    requireNotArchived(
      existing,
      'Restore the content item before publishing it',
    );
    await requireAncestorsNotArchived(coreTable, key);
    if (existing.visibility === 'visible') {
      return asContentItemOutput<IPublishContentItemOutput>(existing);
    }

    const { data: contentItem } = await coreTable.entities.contentItem
      .patch(key)
      .set({ visibility: 'visible' })
      .go({ response: 'all_new' });

    return asContentItemOutput<IPublishContentItemOutput>(contentItem);
  });

export const hideContentItem = courseProcedure
  .input(HideContentItemInputSchema)
  .output(HideContentItemOutputSchema)
  .mutation(async ({ ctx, input }) => {
    const coreTable = ctx.coreTable!;
    const { courseId, moduleId, lessonId, contentItemId } = input;
    const key = { courseId, moduleId, lessonId, contentItemId };

    await requireCourseInstructor(coreTable, courseId, ctx.user.sub);
    const existing = await getContentItemOrThrow(coreTable, key);
    requireNotArchived(existing, 'Restore the content item before hiding it');
    await requireAncestorsNotArchived(coreTable, key);
    if (existing.visibility === 'hidden') {
      return asContentItemOutput<IHideContentItemOutput>(existing);
    }

    const { data: contentItem } = await coreTable.entities.contentItem
      .patch(key)
      .set({ visibility: 'hidden' })
      .go({ response: 'all_new' });

    return asContentItemOutput<IHideContentItemOutput>(contentItem);
  });

// A content item under an archived lesson or module can't be restored on its
// own: it would still be hidden by that ancestor, so the ancestor has to come
// back first.
export const restoreContentItem = courseProcedure
  .input(RestoreContentItemInputSchema)
  .output(RestoreContentItemOutputSchema)
  .mutation(async ({ ctx, input }) => {
    const coreTable = ctx.coreTable!;
    const { courseId, moduleId, lessonId, contentItemId } = input;
    const key = { courseId, moduleId, lessonId, contentItemId };

    await requireCourseInstructor(coreTable, courseId, ctx.user.sub);
    const existing = await getContentItemOrThrow(coreTable, key);
    if (!existing.archivedAt) {
      return asContentItemOutput<IRestoreContentItemOutput>(existing);
    }

    const [{ data: module }, { data: lesson }] = await Promise.all([
      coreTable.entities.module.get({ courseId, moduleId }).go(),
      coreTable.entities.lesson.get({ courseId, moduleId, lessonId }).go(),
    ]);
    if (!module || !lesson) {
      throw new TRPCError({ code: 'NOT_FOUND' });
    }
    requireNotArchived(module, 'Restore the module first');
    requireNotArchived(lesson, 'Restore the lesson first');

    // `order` was never touched by archiving, so the item returns to its
    // original position.
    const { data: contentItem } = await coreTable.entities.contentItem
      .patch(key)
      .remove(['archivedAt'])
      .go({ response: 'all_new' });

    return asContentItemOutput<IRestoreContentItemOutput>(contentItem);
  });

// Removes an archived content item for good. Refused once any student has
// activity on it: that data must survive curriculum edits, so such an item
// can stay archived but never be deleted.
export const deleteContentItemPermanently = courseProcedure
  .input(DeleteContentItemPermanentlyInputSchema)
  .output(DeleteContentItemPermanentlyOutputSchema)
  .mutation(async ({ ctx, input }) => {
    const coreTable = ctx.coreTable!;
    const { courseId, moduleId, lessonId, contentItemId } = input;
    const key = { courseId, moduleId, lessonId, contentItemId };

    await requireCourseInstructor(coreTable, courseId, ctx.user.sub);
    const existing = await getContentItemOrThrow(coreTable, key);
    if (!existing.archivedAt) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'Archive the content item before deleting it permanently',
      });
    }

    if (existing.studentActivityCount > 0) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message:
          'Students have activity on this content item, so it can stay archived but cannot be deleted permanently',
      });
    }

    // The same conditions again on the delete itself, so a student's first
    // activity or a restore landing after the checks above isn't lost.
    const { data: contentItem } = await coreTable.entities.contentItem
      .delete(key)
      .where(
        (attr, op) =>
          `${op.eq(attr.studentActivityCount, 0)} AND ${op.exists(attr.archivedAt)}`,
      )
      .go({ response: 'all_old' })
      .catch((error: unknown) => {
        if (isConditionalCheckFailed(error)) {
          throw new TRPCError({
            code: 'CONFLICT',
            message:
              'The content item changed while it was being deleted; retry the delete',
          });
        }
        throw error;
      });
    if (!contentItem) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to delete content item',
      });
    }

    await cleanUpDeletedContentItem(ctx.logger, contentItem);
    return asContentItemOutput<IDeleteContentItemPermanentlyOutput>(
      contentItem,
    );
  });
