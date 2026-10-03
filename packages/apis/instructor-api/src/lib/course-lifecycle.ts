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
// permanent. A published or archived course may have students with
// progress or attempts, so new records start hidden until published and
// delete archives instead.
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

// An archived module or lesson freezes everything under it: nothing beneath
// it can be added, edited, published or hidden until it's restored, so a
// restore brings back exactly what was archived. Checks the module, and the
// lesson too when `lessonId` is given; the module is checked first, matching
// the order restores have to happen in.
export const requireAncestorsNotArchived = async (
  coreTable: CoreTable,
  {
    courseId,
    moduleId,
    lessonId,
  }: { courseId: string; moduleId: string; lessonId?: string },
) => {
  const [{ data: module }, lessonResult] = await Promise.all([
    coreTable.entities.module.get({ courseId, moduleId }).go(),
    lessonId === undefined
      ? Promise.resolve(undefined)
      : coreTable.entities.lesson.get({ courseId, moduleId, lessonId }).go(),
  ]);
  if (!module) {
    throw new TRPCError({ code: 'NOT_FOUND' });
  }
  requireNotArchived(module, 'Restore the module first');
  if (lessonResult !== undefined) {
    if (!lessonResult.data) {
      throw new TRPCError({ code: 'NOT_FOUND' });
    }
    requireNotArchived(lessonResult.data, 'Restore the lesson first');
  }
};

// A DynamoDB conditional write whose condition didn't hold, as opposed to
// any other failure.
export const isConditionalCheckFailed = (error: unknown): boolean =>
  error instanceof Error &&
  'cause' in error &&
  error.cause instanceof Error &&
  error.cause.name === 'ConditionalCheckFailedException';

type TransactionWrite = CoreTable['transaction']['write'];
export type TransactionEntities = Parameters<
  Parameters<TransactionWrite>[0]
>[0];
type TransactionItems = ReturnType<Parameters<TransactionWrite>[0]>;

export interface AncestorKey {
  courseId: string;
  moduleId: string;
  lessonId?: string;
}

const conflict = () =>
  new TRPCError({
    code: 'CONFLICT',
    message: 'The record was modified by another request; please retry',
  });

// Condition checks that let a transaction land only while every ancestor
// still exists and isn't archived. They go first in the transaction: their
// position is how a cancellation is attributed back to them.
const ancestorChecks = (
  entities: TransactionEntities,
  { courseId, moduleId, lessonId }: AncestorKey,
) => [
  entities.module
    .check({ courseId, moduleId })
    .where(
      (attr, op) =>
        `${op.exists(attr.moduleId)} AND ${op.notExists(attr.archivedAt)}`,
    )
    .commit(),
  ...(lessonId === undefined
    ? []
    : [
        entities.lesson
          .check({ courseId, moduleId, lessonId })
          .where(
            (attr, op) =>
              `${op.exists(attr.lessonId)} AND ${op.notExists(attr.archivedAt)}`,
          )
          .commit(),
      ]),
];

// Runs `writes` in one transaction behind condition checks on every
// ancestor, so the write lands only if no ancestor was archived or removed
// in the meantime: checking the ancestors first (requireAncestorsNotArchived)
// and writing afterwards would leave a window where another request archives
// or permanently deletes the parent in between, leaving a child edited under
// an archived parent or orphaned.
//
// On cancellation:
// - an ancestor's check failed: re-checks the ancestors to throw the precise
//   error ("Restore the module first", NOT_FOUND), else CONFLICT;
// - one of `writes` failed its own condition: `onWriteConflict` throws the
//   caller's error (CONFLICT by default);
// - anything else: INTERNAL_SERVER_ERROR.
export const writeUnderActiveAncestors = async (
  coreTable: CoreTable,
  ancestors: AncestorKey,
  writes: (entities: TransactionEntities) => TransactionItems,
  onWriteConflict: () => Promise<never> | never = () => {
    throw conflict();
  },
) => {
  const { canceled, data } = await coreTable.transaction
    .write((entities) => [
      ...ancestorChecks(entities, ancestors),
      ...writes(entities),
    ])
    .go();
  if (!canceled) {
    return;
  }

  const ancestorCount = ancestors.lessonId === undefined ? 1 : 2;
  const results: ({ code?: string } | undefined)[] = data ?? [];
  const failedAt = (from: number, to?: number) =>
    results
      .slice(from, to)
      .some((result) => result?.code === 'ConditionalCheckFailed');

  if (failedAt(0, ancestorCount)) {
    await requireAncestorsNotArchived(coreTable, ancestors);
    throw conflict();
  }
  if (failedAt(ancestorCount)) {
    await onWriteConflict();
    throw conflict();
  }
  throw new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    message: 'Failed to save the change',
  });
};

// DynamoDB caps a single transaction at 100 items.
export const MAX_TRANSACTION_ITEMS = 100;
