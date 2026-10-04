/**
 * Copyright Discava Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { z } from 'zod';
import { ContentItemSchema } from './content-item.js';
import { LessonSchema } from './lesson.js';
import { ModuleSchema } from './module.js';

export const CourseStatusSchema = z.enum(['draft', 'published', 'archived']);

export const CreateCourseInputSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
});

export type ICreateCourseInput = z.output<typeof CreateCourseInputSchema>;

export const CourseSchema = z.object({
  courseId: z.string(),
  title: z.string(),
  description: z.string().optional(),
  status: CourseStatusSchema,
  publishedAt: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ICourse = z.output<typeof CourseSchema>;

export const CreateCourseOutputSchema = CourseSchema;

export type ICreateCourseOutput = z.output<typeof CreateCourseOutputSchema>;

export const ArchiveCourseInputSchema = z.object({
  courseId: z.string(),
});

export type IArchiveCourseInput = z.output<typeof ArchiveCourseInputSchema>;

export const ArchiveCourseOutputSchema = CourseSchema;

export type IArchiveCourseOutput = z.output<typeof ArchiveCourseOutputSchema>;

export const PublishCourseInputSchema = z.object({
  courseId: z.string(),
});

export type IPublishCourseInput = z.output<typeof PublishCourseInputSchema>;

export const PublishCourseOutputSchema = CourseSchema;

export type IPublishCourseOutput = z.output<typeof PublishCourseOutputSchema>;

export const RestoreCourseInputSchema = z.object({
  courseId: z.string(),
});

export type IRestoreCourseInput = z.output<typeof RestoreCourseInputSchema>;

export const RestoreCourseOutputSchema = CourseSchema;

export type IRestoreCourseOutput = z.output<typeof RestoreCourseOutputSchema>;

export const ViewCourseInputSchema = z.object({
  courseId: z.string(),
});

export type IViewCourseInput = z.output<typeof ViewCourseInputSchema>;

// The instructor's view of a course: the whole curriculum, including hidden
// and archived records (with their visibility/archivedAt), which the
// student-facing core-api course.view filters out.
export const ViewCourseOutputSchema = CourseSchema.extend({
  modules: z.array(
    ModuleSchema.extend({
      lessons: z.array(
        LessonSchema.extend({
          contentItems: z.array(ContentItemSchema),
        }),
      ),
    }),
  ),
});

export type IViewCourseOutput = z.output<typeof ViewCourseOutputSchema>;
