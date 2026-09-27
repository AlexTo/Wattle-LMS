/**
 * Copyright Discava Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { z } from 'zod';

export const QueryInputSchema = z.object({
  cursor: z.string().optional(),
  limit: z.number().max(100).optional().default(10),
});

export type IQueryInput = z.output<typeof QueryInputSchema>;

export const createPaginatedQueryOutputSchema = <ItemType extends z.ZodType>(
  itemSchema: ItemType,
) =>
  z.object({
    items: z.array(itemSchema),
    cursor: z.string().nullable(),
  });
