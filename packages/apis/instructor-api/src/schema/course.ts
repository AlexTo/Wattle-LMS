/**
 * Copyright Discava Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { z } from 'zod';

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
