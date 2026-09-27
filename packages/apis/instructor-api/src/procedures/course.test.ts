/**
 * Copyright Discava Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import type { APIGatewayProxyEvent } from 'aws-lambda';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '../init.js';
import { archiveCourse, createCourse } from './course.js';

const {
  courseCreate,
  courseGet,
  coursePatch,
  coursePatchSet,
  courseInstructorCreate,
  courseInstructorGet,
  courseInstructorQueryPrimary,
  courseInstructorPatch,
  courseInstructorPatchSet,
  transactionWrite,
  transactionGo,
} = vi.hoisted(() => ({
  courseCreate: vi.fn(),
  courseGet: vi.fn(),
  coursePatch: vi.fn(),
  coursePatchSet: vi.fn(),
  courseInstructorCreate: vi.fn(),
  courseInstructorGet: vi.fn(),
  courseInstructorQueryPrimary: vi.fn(),
  courseInstructorPatch: vi.fn(),
  courseInstructorPatchSet: vi.fn(),
  transactionWrite: vi.fn(),
  transactionGo: vi.fn(),
}));

vi.mock('@discava/core-table', () => ({
  createCoreTableService: vi.fn(async () => ({
    entities: {
      course: {
        create: courseCreate,
        get: courseGet,
        patch: coursePatch,
      },
      courseInstructor: {
        create: courseInstructorCreate,
        get: courseInstructorGet,
        query: {
          primary: courseInstructorQueryPrimary,
        },
        patch: courseInstructorPatch,
      },
    },
    transaction: {
      write: transactionWrite,
    },
  })),
}));

const router = t.router({ createCourse, archiveCourse });
const caller = t.createCallerFactory(router);

const INSTRUCTOR_SUB = 'instructor-1';

const buildEvent = (groups: string[]): APIGatewayProxyEvent =>
  ({
    requestContext: {
      authorizer: { claims: { sub: INSTRUCTOR_SUB, 'cognito:groups': groups } },
    },
  }) as unknown as APIGatewayProxyEvent;

const callAs = (groups: string[] = ['instructor']) =>
  caller({ event: buildEvent(groups), context: {} as any, info: {} as any });

const course = {
  courseId: 'course-1',
  title: 'Intro to DynamoDB',
  status: 'draft' as const,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();

  courseCreate.mockImplementation((attrs) => ({
    commit: () => ({ item: null, attrs }),
  }));
  courseInstructorCreate.mockImplementation((attrs) => ({
    commit: () => ({ item: null, attrs }),
  }));
  transactionWrite.mockImplementation((fn) => {
    fn({
      course: { create: courseCreate },
      courseInstructor: { create: courseInstructorCreate },
    });
    return { go: transactionGo };
  });
  transactionGo.mockResolvedValue({ canceled: false, data: [] });
  courseGet.mockReturnValue({
    go: vi.fn().mockResolvedValue({ data: course }),
  });

  coursePatch.mockReturnValue({ set: coursePatchSet });
  coursePatchSet.mockReturnValue({
    go: vi.fn().mockResolvedValue({ data: { ...course, status: 'archived' } }),
  });
  courseInstructorGet.mockReturnValue({
    go: vi.fn().mockResolvedValue({
      data: { courseId: course.courseId, instructorId: INSTRUCTOR_SUB },
    }),
  });
  courseInstructorQueryPrimary.mockReturnValue({
    go: vi.fn().mockResolvedValue({
      data: [{ courseId: course.courseId, instructorId: INSTRUCTOR_SUB }],
    }),
  });
  courseInstructorPatch.mockReturnValue({ set: courseInstructorPatchSet });
  courseInstructorPatchSet.mockReturnValue({
    go: vi.fn().mockResolvedValue({ data: undefined }),
  });
});

describe('createCourse', () => {
  it('rejects callers who are not in the instructor group', async () => {
    await expect(
      callAs(['student']).createCourse({ title: 'Intro' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(transactionWrite).not.toHaveBeenCalled();
  });

  // Invariant: a course must never exist without at least one instructor.
  // That's only guaranteed if both writes are enqueued inside the same
  // transaction, rather than as two independent, individually-failable calls.
  it('creates the course and its initial CourseInstructor row in a single transaction', async () => {
    await callAs().createCourse({
      title: 'Intro to DynamoDB',
      description: 'desc',
    });

    expect(transactionWrite).toHaveBeenCalledTimes(1);
    expect(courseCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Intro to DynamoDB',
        description: 'desc',
      }),
    );
    expect(courseInstructorCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        instructorId: INSTRUCTOR_SUB,
        courseUpdatedAt: expect.any(String),
      }),
    );

    const [courseArgs] = courseCreate.mock.calls[0];
    const [instructorArgs] = courseInstructorCreate.mock.calls[0];
    expect(instructorArgs.courseId).toBe(courseArgs.courseId);
  });

  it('returns the course fetched after the transaction commits', async () => {
    const result = await callAs().createCourse({ title: 'Intro to DynamoDB' });
    expect(result).toEqual(course);
  });

  it('throws INTERNAL_SERVER_ERROR when the transaction is canceled', async () => {
    transactionGo.mockResolvedValue({ canceled: true, data: [] });

    await expect(
      callAs().createCourse({ title: 'Intro to DynamoDB' }),
    ).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
    expect(courseGet).not.toHaveBeenCalled();
  });

  it('throws INTERNAL_SERVER_ERROR when the course cannot be found after a successful transaction', async () => {
    courseGet.mockReturnValue({
      go: vi.fn().mockResolvedValue({ data: undefined }),
    });

    await expect(
      callAs().createCourse({ title: 'Intro to DynamoDB' }),
    ).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
  });
});

describe('archiveCourse', () => {
  it('rejects callers who are not in the instructor group before checking course membership', async () => {
    await expect(
      callAs(['student']).archiveCourse({ courseId: course.courseId }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(courseInstructorGet).not.toHaveBeenCalled();
  });

  // Invariant: only an instructor who actually teaches the course may
  // archive it -- membership in the `instructor` group is not enough.
  it('throws FORBIDDEN when the caller does not teach the course', async () => {
    courseInstructorGet.mockReturnValue({
      go: vi.fn().mockResolvedValue({ data: undefined }),
    });

    await expect(
      callAs().archiveCourse({ courseId: course.courseId }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(coursePatch).not.toHaveBeenCalled();
    expect(courseInstructorQueryPrimary).not.toHaveBeenCalled();
  });

  it('archives a course the caller teaches', async () => {
    const result = await callAs().archiveCourse({ courseId: course.courseId });

    expect(courseInstructorGet).toHaveBeenCalledWith({
      courseId: course.courseId,
      instructorId: INSTRUCTOR_SUB,
    });
    expect(coursePatch).toHaveBeenCalledWith({ courseId: course.courseId });
    expect(coursePatchSet).toHaveBeenCalledWith({ status: 'archived' });
    expect(result).toEqual({ ...course, status: 'archived' });
  });

  // byInstructor's sort key is courseUpdatedAt#courseId, so every
  // CourseInstructor row for the course needs the refreshed timestamp, not
  // just the caller's own membership row.
  it('refreshes the denormalized courseUpdatedAt on every instructor teaching the course', async () => {
    courseInstructorQueryPrimary.mockReturnValue({
      go: vi.fn().mockResolvedValue({
        data: [
          { courseId: course.courseId, instructorId: INSTRUCTOR_SUB },
          { courseId: course.courseId, instructorId: 'co-instructor' },
        ],
      }),
    });

    await callAs().archiveCourse({ courseId: course.courseId });

    expect(courseInstructorQueryPrimary).toHaveBeenCalledWith({
      courseId: course.courseId,
    });
    expect(courseInstructorPatch).toHaveBeenCalledWith({
      courseId: course.courseId,
      instructorId: INSTRUCTOR_SUB,
    });
    expect(courseInstructorPatch).toHaveBeenCalledWith({
      courseId: course.courseId,
      instructorId: 'co-instructor',
    });
    expect(courseInstructorPatchSet).toHaveBeenCalledWith({
      courseUpdatedAt: course.updatedAt,
    });
    expect(courseInstructorPatchSet).toHaveBeenCalledTimes(2);
  });
});
