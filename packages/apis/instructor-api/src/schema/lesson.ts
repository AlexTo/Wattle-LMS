/**
 * Copyright Discava Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { z } from 'zod';

export const LessonSchema = z.object({
  lessonId: z.string(),
  moduleId: z.string(),
  courseId: z.string(),
  title: z.string(),
  description: z.string().optional(),
  order: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ILesson = z.output<typeof LessonSchema>;

export const CreateLessonInputSchema = z.object({
  courseId: z.string(),
  moduleId: z.string(),
  title: z.string().min(1).max(200),
  description: z.string().optional(),
});

export type ICreateLessonInput = z.output<typeof CreateLessonInputSchema>;

export const CreateLessonOutputSchema = LessonSchema;

export type ICreateLessonOutput = z.output<typeof CreateLessonOutputSchema>;

export const UpdateLessonInputSchema = z.object({
  courseId: z.string(),
  moduleId: z.string(),
  lessonId: z.string(),
  title: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  order: z.number().optional(),
});

export type IUpdateLessonInput = z.output<typeof UpdateLessonInputSchema>;

export const UpdateLessonOutputSchema = LessonSchema;

export type IUpdateLessonOutput = z.output<typeof UpdateLessonOutputSchema>;

export const DeleteLessonInputSchema = z.object({
  courseId: z.string(),
  moduleId: z.string(),
  lessonId: z.string(),
});

export type IDeleteLessonInput = z.output<typeof DeleteLessonInputSchema>;

export const DeleteLessonOutputSchema = LessonSchema;

export type IDeleteLessonOutput = z.output<typeof DeleteLessonOutputSchema>;
