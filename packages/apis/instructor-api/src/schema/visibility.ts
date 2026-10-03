/**
 * Copyright Discava Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { z } from 'zod';

export const CurriculumVisibilitySchema = z.enum(['hidden', 'visible']);

export type ICurriculumVisibility = z.output<typeof CurriculumVisibilitySchema>;
