/**
 * Copyright Discava Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { z } from 'zod';

export const ModuleSchema = z.object({
  moduleId: z.string(),
  courseId: z.string(),
  title: z.string(),
  description: z.string().optional(),
  order: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type IModule = z.output<typeof ModuleSchema>;

export const CreateModuleInputSchema = z.object({
  courseId: z.string(),
  title: z.string().min(1).max(200),
  description: z.string().optional(),
});

export type ICreateModuleInput = z.output<typeof CreateModuleInputSchema>;

export const CreateModuleOutputSchema = ModuleSchema;

export type ICreateModuleOutput = z.output<typeof CreateModuleOutputSchema>;

export const UpdateModuleInputSchema = z.object({
  courseId: z.string(),
  moduleId: z.string(),
  title: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  order: z.number().optional(),
});

export type IUpdateModuleInput = z.output<typeof UpdateModuleInputSchema>;

export const UpdateModuleOutputSchema = ModuleSchema;

export type IUpdateModuleOutput = z.output<typeof UpdateModuleOutputSchema>;

export const DeleteModuleInputSchema = z.object({
  courseId: z.string(),
  moduleId: z.string(),
});

export type IDeleteModuleInput = z.output<typeof DeleteModuleInputSchema>;

export const DeleteModuleOutputSchema = ModuleSchema;

export type IDeleteModuleOutput = z.output<typeof DeleteModuleOutputSchema>;
