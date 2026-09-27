/**
 * Copyright Discava Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import type { APIGatewayProxyEvent } from 'aws-lambda';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '../init.js';
import { deleteContentItem } from './content-item-shared.js';

const {
  courseGet,
  courseInstructorGet,
  contentItemGet,
  contentItemDelete,
  bestEffortDeleteContentItemVideos,
  bestEffortCancelTranscodeJobs,
} = vi.hoisted(() => ({
  courseGet: vi.fn(),
  courseInstructorGet: vi.fn(),
  contentItemGet: vi.fn(),
  contentItemDelete: vi.fn(),
  bestEffortDeleteContentItemVideos: vi.fn(),
  bestEffortCancelTranscodeJobs: vi.fn(),
}));

vi.mock('@discava/core-table', () => ({
  createCoreTableService: vi.fn(async () => ({
    entities: {
      course: { get: courseGet },
      courseInstructor: {
        get: courseInstructorGet,
      },
      contentItem: {
        get: contentItemGet,
        delete: contentItemDelete,
      },
    },
  })),
}));

// bestEffortDeleteContentItemVideos's own error-swallowing/bucket-selection
// behavior is covered directly in lib/s3-client.test.ts; here it's just a
// mock so these tests can assert content-item-shared.ts calls it correctly.
vi.mock('../lib/s3-client.js', () => ({
  bestEffortDeleteContentItemVideos,
}));

// bestEffortCancelTranscodeJobs's own status/job-id filtering is covered
// directly in lib/mediaconvert-client.test.ts; here it's just a mock so
// these tests can assert content-item-shared.ts calls it correctly.
vi.mock('../lib/mediaconvert-client.js', () => ({
  bestEffortCancelTranscodeJobs,
}));

const router = t.router({ deleteContentItem });
const caller = t.createCallerFactory(router);

const INSTRUCTOR_SUB = 'instructor-1';
const COURSE_ID = 'course-1';
const MODULE_ID = 'module-1';
const LESSON_ID = 'lesson-1';
const CONTENT_ITEM_ID = 'content-item-1';

const buildEvent = (groups: string[]): APIGatewayProxyEvent =>
  ({
    requestContext: {
      authorizer: { claims: { sub: INSTRUCTOR_SUB, 'cognito:groups': groups } },
    },
  }) as unknown as APIGatewayProxyEvent;

const callAs = (groups: string[] = ['instructor']) =>
  caller({ event: buildEvent(groups), context: {} as any, info: {} as any });

const videoContentItem = {
  contentItemId: CONTENT_ITEM_ID,
  lessonId: LESSON_ID,
  moduleId: MODULE_ID,
  courseId: COURSE_ID,
  type: 'video' as const,
  status: 'ready' as const,
  title: 'Intro video',
  s3Key: `courses/${COURSE_ID}/modules/${MODULE_ID}/lessons/${LESSON_ID}/content-items/${CONTENT_ITEM_ID}.mp4`,
  mimeType: 'video/mp4',
  order: 1,
  visibility: 'visible' as const,
  studentActivityCount: 0,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

const textContentItem = {
  contentItemId: CONTENT_ITEM_ID,
  lessonId: LESSON_ID,
  moduleId: MODULE_ID,
  courseId: COURSE_ID,
  type: 'text' as const,
  status: 'ready' as const,
  title: 'Welcome notes',
  body: JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] }),
  order: 1,
  visibility: 'visible' as const,
  studentActivityCount: 0,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();

  courseGet.mockReturnValue({
    go: vi.fn().mockResolvedValue({ data: { status: 'draft' } }),
  });

  courseInstructorGet.mockReturnValue({
    go: vi.fn().mockResolvedValue({
      data: { courseId: COURSE_ID, instructorId: INSTRUCTOR_SUB },
    }),
  });
  contentItemGet.mockReturnValue({
    go: vi.fn().mockResolvedValue({ data: videoContentItem }),
  });
  contentItemDelete.mockReturnValue({
    go: vi.fn().mockResolvedValue({ data: videoContentItem }),
  });
  bestEffortDeleteContentItemVideos.mockResolvedValue(undefined);
  bestEffortCancelTranscodeJobs.mockResolvedValue(undefined);
});

describe('deleteContentItem', () => {
  const input = {
    courseId: COURSE_ID,
    moduleId: MODULE_ID,
    lessonId: LESSON_ID,
    contentItemId: CONTENT_ITEM_ID,
  };

  it('rejects callers who are not in the instructor group before checking course membership', async () => {
    await expect(
      callAs(['student']).deleteContentItem(input),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(courseInstructorGet).not.toHaveBeenCalled();
  });

  it('throws NOT_FOUND when the content item does not exist', async () => {
    contentItemGet.mockReturnValue({
      go: vi.fn().mockResolvedValue({ data: undefined }),
    });

    await expect(callAs().deleteContentItem(input)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(contentItemDelete).not.toHaveBeenCalled();
  });

  it('deletes a video content item and its S3 object', async () => {
    const result = await callAs().deleteContentItem(input);

    expect(contentItemDelete).toHaveBeenCalledWith(input);
    expect(bestEffortDeleteContentItemVideos).toHaveBeenCalledWith(
      expect.anything(),
      [videoContentItem],
    );
    expect(bestEffortCancelTranscodeJobs).toHaveBeenCalledWith(
      expect.anything(),
      [videoContentItem],
    );
    expect(result).toEqual(videoContentItem);
  });

  // A still-transcoding video's job has nothing left to report to once its
  // content item is gone -- see the mediaConvertJobId design in #123.
  it('cancels an in-flight transcode job when deleting a still-pending video', async () => {
    const pendingVideoContentItem = {
      ...videoContentItem,
      status: 'pending' as const,
      mediaConvertJobId: 'job-1',
    };
    contentItemGet.mockReturnValue({
      go: vi.fn().mockResolvedValue({ data: pendingVideoContentItem }),
    });
    contentItemDelete.mockReturnValue({
      go: vi.fn().mockResolvedValue({ data: pendingVideoContentItem }),
    });

    await callAs().deleteContentItem(input);

    expect(bestEffortCancelTranscodeJobs).toHaveBeenCalledWith(
      expect.anything(),
      [pendingVideoContentItem],
    );
  });

  // A concurrent replacement can land between the initial read and the
  // delete -- DeleteItem's own response: 'all_old' return is the only
  // thing that reflects exactly what was actually removed.
  it('cleans up the record DeleteItem actually removed, not the earlier read, when a replacement raced the delete', async () => {
    const supersededVideo = {
      ...videoContentItem,
      s3Key: `courses/${COURSE_ID}/modules/${MODULE_ID}/lessons/${LESSON_ID}/content-items/${CONTENT_ITEM_ID}/old-nonce/master.m3u8`,
      submissionNonce: 'old-nonce',
    };
    const replacementVideo = {
      ...videoContentItem,
      s3Key: `courses/${COURSE_ID}/modules/${MODULE_ID}/lessons/${LESSON_ID}/content-items/${CONTENT_ITEM_ID}/new-nonce/master.m3u8`,
      submissionNonce: 'new-nonce',
    };
    contentItemGet.mockReturnValue({
      go: vi.fn().mockResolvedValue({ data: supersededVideo }),
    });
    contentItemDelete.mockReturnValue({
      go: vi.fn().mockResolvedValue({ data: replacementVideo }),
    });

    const result = await callAs().deleteContentItem(input);

    expect(bestEffortCancelTranscodeJobs).toHaveBeenCalledWith(
      expect.anything(),
      [replacementVideo],
    );
    expect(bestEffortDeleteContentItemVideos).toHaveBeenCalledWith(
      expect.anything(),
      [replacementVideo],
    );
    expect(bestEffortCancelTranscodeJobs).not.toHaveBeenCalledWith(
      expect.anything(),
      [supersededVideo],
    );
    expect(bestEffortDeleteContentItemVideos).not.toHaveBeenCalledWith(
      expect.anything(),
      [supersededVideo],
    );
    // submissionNonce is internal-only and stripped by the output schema --
    // s3Key is what distinguishes the replacement from the superseded video.
    expect(result.s3Key).toEqual(replacementVideo.s3Key);
  });

  it('deletes a text content item without attempting an S3 cleanup or job cancellation', async () => {
    contentItemGet.mockReturnValue({
      go: vi.fn().mockResolvedValue({ data: textContentItem }),
    });
    contentItemDelete.mockReturnValue({
      go: vi.fn().mockResolvedValue({ data: textContentItem }),
    });

    const result = await callAs().deleteContentItem(input);

    expect(bestEffortDeleteContentItemVideos).not.toHaveBeenCalled();
    expect(bestEffortCancelTranscodeJobs).not.toHaveBeenCalled();
    expect(result).toEqual(textContentItem);
  });
});
