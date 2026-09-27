/**
 * Copyright Discava Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { TRPCError } from '@trpc/server';
import { courseProcedure } from '../init.js';
import { bestEffortCancelTranscodeJobs } from '../lib/mediaconvert-client.js';
import { bestEffortDeleteContentItemVideos } from '../lib/s3-client.js';
import {
  DeleteContentItemInputSchema,
  DeleteContentItemOutputSchema,
  type IDeleteContentItemOutput,
} from '../schema/index.js';

// ElectroDB has no native discriminated-attribute support, so a contentItem
// record's inferred type is flat (every type's attributes present as
// optional alongside `type` itself) rather than a proper union keyed on
// `type`. These casts bridge that gap to the discriminated-union API types
// -- safe because each cast site has already checked/branched on `type` (or,
// for delete, is just passing through whatever `existing` was). Shared
// across every content-item-<type>.ts procedures file.
export const asContentItemOutput = <T>(contentItem: unknown) =>
  contentItem as T;

// Type-agnostic: works the same for every content item type (video, text,
// and whatever else lands here -- quiz, image, etc.), only branching to
// clean up a type's own external storage (e.g. video's S3 object) where
// that type has any.
export const deleteContentItem = courseProcedure
  .input(DeleteContentItemInputSchema)
  .output(DeleteContentItemOutputSchema)
  .mutation(async ({ ctx, input }) => {
    const coreTable = ctx.coreTable!;
    const { courseId, moduleId, lessonId, contentItemId } = input;
    const { sub: currentUser } = ctx.user;

    // Only instructors teaching this specific course may remove content
    // from its lessons, not just any member of the instructor group.
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

    const { data: contentItem } = await coreTable.entities.contentItem
      .delete({ courseId, moduleId, lessonId, contentItemId })
      .go({ response: 'all_old' });
    if (!contentItem) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to delete content item',
      });
    }

    if (contentItem.type === 'video') {
      // A still-transcoding job has nothing left to report to once its
      // content item is gone -- cancel it so it doesn't keep running only
      // to leave an orphaned HLS output with no record pointing at it.
      // Uses the record DeleteItem actually removed (response: 'all_old'),
      // not the earlier `existing` read -- a concurrent replacement could
      // have landed between the two, and cleaning up based on stale state
      // would cancel/delete the wrong job and orphan the real one.
      await bestEffortCancelTranscodeJobs(ctx.logger, [contentItem]);
      if (contentItem.s3Key) {
        await bestEffortDeleteContentItemVideos(ctx.logger, [contentItem]);
      }
    }

    return asContentItemOutput<IDeleteContentItemOutput>(contentItem);
  });
