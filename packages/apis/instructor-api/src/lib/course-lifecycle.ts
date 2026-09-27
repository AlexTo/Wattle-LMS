/**
 * Copyright Discava Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { TRPCError } from '@trpc/server';
import type { ICoreTableContext } from '../middleware/core-table.js';
import type { ICurriculumVisibility } from '../schema/index.js';

type CoreTable = NonNullable<ICoreTableContext['coreTable']>;

// Only instructors teaching this specific course may change its curriculum,
// not just any member of the instructor group.
export const requireCourseInstructor = async (
  coreTable: CoreTable,
  courseId: string,
  instructorId: string,
) => {
  const { data: membership } = await coreTable.entities.courseInstructor
    .get({ courseId, instructorId })
    .go();
  if (!membership) {
    throw new TRPCError({ code: 'FORBIDDEN' });
  }
};

export const getCourseOrThrow = async (
  coreTable: CoreTable,
  courseId: string,
) => {
  const { data: course } = await coreTable.entities.course
    .get({ courseId })
    .go();
  if (!course) {
    throw new TRPCError({ code: 'NOT_FOUND' });
  }
  return course;
};

// A draft course has never been open to students, so its curriculum is
// edited freely: new records are visible straight away and delete is
// permanent. Any other status (published, or archived after having been
// published) may have students with progress or attempts, so new records
// start hidden until published and delete archives instead.
export const isDraftCourse = (course: { status: string }) =>
  course.status === 'draft';

export const initialVisibility = (course: {
  status: string;
}): ICurriculumVisibility => (isDraftCourse(course) ? 'visible' : 'hidden');

export const requireNotArchived = (
  record: { archivedAt?: string },
  message: string,
) => {
  if (record.archivedAt) {
    throw new TRPCError({ code: 'PRECONDITION_FAILED', message });
  }
};

// DynamoDB caps a single transaction at 100 items.
export const MAX_TRANSACTION_ITEMS = 100;
