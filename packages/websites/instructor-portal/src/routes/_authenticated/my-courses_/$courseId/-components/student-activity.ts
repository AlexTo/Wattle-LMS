/**
 * Copyright Discava Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

const plural = (count: number, word: string) =>
  `${count} ${word}${count === 1 ? '' : 's'}`;

// How much students have used a record, from studentActivityCount. For an item
// that's the number of students; for a module or lesson it's the number of its
// items students have used, since adding up students across items would count
// the same student more than once.
export const studentActivityNote = ({
  students,
  items,
}: {
  students?: number;
  items?: number;
}) =>
  students
    ? `${plural(students, 'student')} ${students === 1 ? 'has' : 'have'} used it`
    : items
      ? `Students have used ${plural(items, 'item')} in it`
      : undefined;

// The items in `contentItems` that students have used.
export const usedItemCount = (
  contentItems: { studentActivityCount?: number }[],
) =>
  contentItems.filter(
    ({ studentActivityCount = 0 }) => studentActivityCount > 0,
  ).length;
