/**
 * Copyright Discava Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

interface CurriculumRecordState {
  visibility: 'hidden' | 'visible';
  archivedAt?: string;
}

// A record's own state only; students see it only if every ancestor passes
// this too (see filterEffectivelyVisible).
export const isShown = (record: CurriculumRecordState) =>
  record.visibility === 'visible' && !record.archivedAt;

// Narrows a course's curriculum to what students may see: a module, lesson or
// content item is kept only if it and every ancestor is visible and not
// archived. Every student-facing read, student write and progress calculation
// goes through this rather than checking a record's own `visibility`.
export const filterEffectivelyVisible = <
  M extends CurriculumRecordState & { moduleId: string },
  L extends CurriculumRecordState & { moduleId: string; lessonId: string },
  C extends CurriculumRecordState & { lessonId: string },
>({
  modules,
  lessons,
  contentItems,
}: {
  modules: M[];
  lessons: L[];
  contentItems: C[];
}) => {
  const shownModules = modules.filter(isShown);
  const shownModuleIds = new Set(shownModules.map(({ moduleId }) => moduleId));
  const shownLessons = lessons.filter(
    (lesson) => isShown(lesson) && shownModuleIds.has(lesson.moduleId),
  );
  const shownLessonIds = new Set(shownLessons.map(({ lessonId }) => lessonId));
  const shownContentItems = contentItems.filter(
    (contentItem) =>
      isShown(contentItem) && shownLessonIds.has(contentItem.lessonId),
  );

  return {
    modules: shownModules,
    lessons: shownLessons,
    contentItems: shownContentItems,
  };
};
