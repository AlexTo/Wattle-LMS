/**
 * Copyright Discava Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { TRPCError } from '@trpc/server';
import { v7 as uuidv7 } from 'uuid';
import { courseProcedure } from '../init.js';
import { requireCourseInstructor } from '../lib/course-lifecycle.js';
import {
  ArchiveCourseInputSchema,
  ArchiveCourseOutputSchema,
  CreateCourseInputSchema,
  CreateCourseOutputSchema,
  type IViewCourseOutput,
  ViewCourseInputSchema,
  ViewCourseOutputSchema,
} from '../schema/index.js';

export const createCourse = courseProcedure
  .input(CreateCourseInputSchema)
  .output(CreateCourseOutputSchema)
  .mutation(async ({ ctx, input }) => {
    const coreTable = ctx.coreTable!;
    const courseId = uuidv7();
    const { sub: currentUser } = ctx.user;
    const { title, description } = input;
    // Course.updatedAt is computed by ElectroDB at write time (not settable
    // here), so this is only an approximation of its real value - fine for a
    // brand new course that's never been touched since.
    const courseUpdatedAt = new Date().toISOString();

    // A course must always have at least one instructor, so the course and
    // its initial CourseInstructor row are written transactionally: either
    // both succeed or neither does. DynamoDB transactions don't return the
    // written attributes, so fetch the course back once the write commits.
    const { canceled } = await coreTable.transaction
      .write((entities) => [
        entities.course.create({ courseId, title, description }).commit(),
        entities.courseInstructor
          .create({ courseId, instructorId: currentUser, courseUpdatedAt })
          .commit(),
      ])
      .go();

    if (canceled) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to create course',
      });
    }

    const { data: course } = await coreTable.entities.course
      .get({ courseId })
      .go();
    if (!course) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to create course',
      });
    }

    return course;
  });

export const archiveCourse = courseProcedure
  .input(ArchiveCourseInputSchema)
  .output(ArchiveCourseOutputSchema)
  .mutation(async ({ ctx, input }) => {
    const coreTable = ctx.coreTable!;
    const { courseId } = input;
    const { sub: currentUser } = ctx.user;

    // Only instructors teaching this specific course may archive it, not
    // just any member of the instructor group.
    const { data: membership } = await coreTable.entities.courseInstructor
      .get({ courseId, instructorId: currentUser })
      .go();
    if (!membership) {
      throw new TRPCError({ code: 'FORBIDDEN' });
    }

    const { data: course } = await coreTable.entities.course
      .patch({ courseId })
      .set({ status: 'archived' })
      .go({ response: 'all_new' });

    // byInstructor's sort key is courseUpdatedAt#courseId, so every course
    // update has to refresh that denormalized timestamp on every
    // CourseInstructor row for this course, not just the caller's own.
    const { data: instructors } =
      await coreTable.entities.courseInstructor.query
        .primary({ courseId })
        .go();
    await Promise.all(
      instructors.map(({ instructorId }) =>
        coreTable.entities.courseInstructor
          .patch({ courseId, instructorId })
          .set({ courseUpdatedAt: course.updatedAt })
          .go(),
      ),
    );

    return course;
  });

// The course editor's view: the whole curriculum, including hidden and
// archived modules, lessons and content items, for instructors teaching the
// course. Students read the course through core-api's course.view, which
// only returns what they may see.
export const viewCourse = courseProcedure
  .input(ViewCourseInputSchema)
  .output(ViewCourseOutputSchema)
  .query(async ({ ctx, input }) => {
    const coreTable = ctx.coreTable!;
    const { courseId } = input;

    await requireCourseInstructor(coreTable, courseId, ctx.user.sub);

    // Course, its modules, their lessons, and each lesson's content items
    // all share the `curriculum` collection's partition, so one query
    // returns the whole curriculum -- every page of it, since a course's
    // curriculum can exceed a single 1 MB query page.
    const {
      data: {
        course: courses,
        module: modules,
        lesson: lessons,
        contentItem: contentItems,
      },
    } = await coreTable.collections
      .curriculum({ courseId })
      .go({ pages: 'all' });
    const [course] = courses;
    if (!course) {
      throw new TRPCError({ code: 'NOT_FOUND' });
    }

    const byOrder = (a: { order: number }, b: { order: number }) =>
      a.order - b.order;

    // contentItem's ElectroDB-inferred type is flat rather than a union
    // keyed on `type`; the cast bridges that gap to the discriminated-union
    // output type, and the zod output schema validates the shape at runtime.
    return {
      ...course,
      modules: modules
        .slice()
        .sort(byOrder)
        .map((module) => ({
          ...module,
          lessons: lessons
            .filter((lesson) => lesson.moduleId === module.moduleId)
            .sort(byOrder)
            .map((lesson) => ({
              ...lesson,
              contentItems: contentItems
                .filter((item) => item.lessonId === lesson.lessonId)
                .sort(byOrder),
            })),
        })),
    } as IViewCourseOutput;
  });
