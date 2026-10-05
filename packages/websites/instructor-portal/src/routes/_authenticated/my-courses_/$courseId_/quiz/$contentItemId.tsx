/**
 * Copyright Discava Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button } from '@discava/common-shadcn/components/ui/button';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { useBreadcrumbLabel } from '../../../../../components/AppLayout/breadcrumb-label';
import { Alert } from '../../../../../components/alert';
import { Spinner } from '../../../../../components/spinner';
import { useInstructorApi } from '../../../../../hooks/useInstructorApi';
import { QuizBuilder } from './-components/quiz-builder';
import type { QuizItem } from './-components/quiz-form';

// "new" for a quiz that hasn't been saved yet, which then needs the module and
// lesson it goes in.
export const Route = createFileRoute(
  '/_authenticated/my-courses_/$courseId_/quiz/$contentItemId',
)({
  component: QuizBuilderPage,
  validateSearch: (search: Record<string, unknown>) => ({
    moduleId: typeof search.moduleId === 'string' ? search.moduleId : undefined,
    lessonId: typeof search.lessonId === 'string' ? search.lessonId : undefined,
  }),
});

function QuizBuilderPage() {
  const { courseId, contentItemId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const trpc = useInstructorApi();
  const courseQuery = useQuery(trpc.course.view.queryOptions({ courseId }));
  // Bumped to start the builder again from what was last saved.
  const [reloads, setReloads] = useState(0);
  const isNew = contentItemId === 'new';

  // Find the quiz, or for a new one its lesson, and everything above it.
  const course = courseQuery.data;
  type Module = NonNullable<typeof course>['modules'][number];
  type Lesson = Module['lessons'][number];
  type Item = Lesson['contentItems'][number];
  let placement: { module: Module; lesson: Lesson; item?: Item } | undefined;
  for (const module of course?.modules ?? []) {
    for (const lesson of module.lessons) {
      if (isNew) {
        if (
          module.moduleId === search.moduleId &&
          lesson.lessonId === search.lessonId
        ) {
          placement = { module, lesson };
        }
        continue;
      }
      const item = lesson.contentItems.find(
        (candidate) => candidate.contentItemId === contentItemId,
      );
      if (item) {
        placement = { module, lesson, item };
      }
    }
  }
  // course.view's content item type is a union keyed on `type`.
  const quiz =
    placement?.item?.type === 'quiz'
      ? (placement.item as unknown as QuizItem)
      : undefined;

  useBreadcrumbLabel(course?.title, `/my-courses/${courseId}`);
  useBreadcrumbLabel('Quizzes', `/my-courses/${courseId}/quiz`);
  useBreadcrumbLabel(isNew ? 'New quiz' : quiz?.title);

  if (courseQuery.isPending) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }
  if (courseQuery.isError || !course || !placement || (!isNew && !quiz)) {
    return (
      <Alert type="error" header="Quiz not found">
        {courseQuery.isError
          ? courseQuery.error.message
          : "This quiz doesn't exist, or you don't have access to it."}
      </Alert>
    );
  }

  const { module, lesson, item } = placement;
  // An archived course, module, lesson or quiz is frozen until restored.
  const readOnlyReason =
    course.status === 'archived'
      ? 'The course is archived. Restore the course to edit its quizzes.'
      : module.archivedAt
        ? `Its module, "${module.title}", is archived. Restore the module first.`
        : lesson.archivedAt
          ? `Its lesson, "${lesson.title}", is archived. Restore the lesson first.`
          : item?.archivedAt
            ? 'This quiz is archived. Restore it from the course page to edit it.'
            : undefined;

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 pb-10">
      <div className="space-y-2">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/my-courses/$courseId" params={{ courseId }}>
            <ArrowLeft /> Back to {course.title}
          </Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">
          {isNew ? 'New quiz' : quiz?.title}
        </h1>
        <p className="text-sm text-muted-foreground">
          In {module.title} › {lesson.title}
        </p>
      </div>
      <QuizBuilder
        key={`${contentItemId}:${reloads}`}
        courseId={courseId}
        moduleId={module.moduleId}
        lessonId={lesson.lessonId}
        contentItemId={isNew ? undefined : contentItemId}
        quiz={quiz}
        studentActivityCount={item?.studentActivityCount ?? 0}
        readOnlyReason={readOnlyReason}
        onCreated={(id) =>
          navigate({
            to: '/my-courses/$courseId/quiz/$contentItemId',
            params: { courseId, contentItemId: id },
            search: { moduleId: undefined, lessonId: undefined },
            replace: true,
          })
        }
        onReload={async () => {
          await courseQuery.refetch();
          setReloads((count) => count + 1);
        }}
      />
    </main>
  );
}
