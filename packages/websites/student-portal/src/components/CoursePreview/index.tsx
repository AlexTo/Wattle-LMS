/**
 * Copyright Discava Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Badge } from '@discava/common-shadcn/components/ui/badge';
import { Button } from '@discava/common-shadcn/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@discava/common-shadcn/components/ui/card';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@discava/common-shadcn/components/ui/dialog';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import {
  ArrowLeft,
  BarChart3,
  BookOpen,
  ChevronDown,
  CircleCheck,
  Clock3,
  FileText,
  Search,
  Sparkles,
} from 'lucide-react';
import { useState } from 'react';
import { useAuth } from 'react-oidc-context';
import { Alert } from '../../components/alert';
import { Spinner } from '../../components/spinner';
import { useCoreApi } from '../../hooks/useCoreApi';
import { toDisplayCourse } from '../../lib/course-display';

export function CoursePreview({
  courseCode,
  backTo,
  backLabel,
}: {
  courseCode: string;
  backTo: string;
  backLabel: string;
}) {
  const trpc = useCoreApi();
  const courseQuery = useQuery(
    trpc.course.publicView.queryOptions({ courseId: courseCode }),
  );
  const { isAuthenticated } = useAuth();
  const [expandedModuleId, setExpandedModuleId] = useState<string>();
  const [enrolOpen, setEnrolOpen] = useState(false);

  if (courseQuery.isLoading) {
    return (
      <main className="mx-auto flex w-full max-w-3xl justify-center px-6 py-24 lg:px-8">
        <Spinner />
      </main>
    );
  }

  if (courseQuery.isError || !courseQuery.data) {
    const notFound =
      (courseQuery.error as { data?: { code?: string } } | undefined)?.data
        ?.code === 'NOT_FOUND';

    return (
      <main className="mx-auto w-full max-w-3xl px-6 py-24 text-center lg:px-8">
        {notFound ? (
          <>
            <Search className="mx-auto size-8 text-muted-foreground" />
            <h1 className="mt-4 text-xl font-semibold">Course not found</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              This course doesn't exist, or may no longer be available.
            </p>
          </>
        ) : (
          <div className="text-left">
            <Alert type="error" header="Couldn't load this course">
              {courseQuery.error?.message}
            </Alert>
          </div>
        )}
        <Button className="mt-6" asChild>
          <Link to={backTo}>
            <ArrowLeft className="size-4" /> {backLabel}
          </Link>
        </Button>
      </main>
    );
  }

  const course = toDisplayCourse(courseQuery.data);
  const modules = courseQuery.data.modules;
  const lessonCount = modules.reduce(
    (total, module) => total + module.lessons.length,
    0,
  );

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-10 lg:px-8">
      <Link
        to={backTo}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> {backLabel}
      </Link>

      <div className="mt-5 overflow-hidden rounded-2xl border shadow-sm">
        <div
          className={`flex h-40 items-center justify-center bg-gradient-to-br sm:h-48 ${course.surface}`}
        >
          <span
            aria-hidden="true"
            className="text-6xl font-semibold text-foreground/80"
          >
            {course.icon}
          </span>
        </div>
        <div className="bg-card p-6 sm:p-8">
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-primary">
              {course.category}
            </span>
          </div>
          <h1 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">
            {course.title}
          </h1>
          <p className="mt-3 max-w-3xl leading-7 text-muted-foreground">
            {course.description}
          </p>
          <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 border-t pt-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Clock3 className="size-4" /> {course.duration}
            </span>
            <span className="flex items-center gap-1.5">
              <BarChart3 className="size-4" /> {course.level}
            </span>
            <span className="flex items-center gap-1.5">
              <BookOpen className="size-4" /> {modules.length}{' '}
              {modules.length === 1 ? 'module' : 'modules'} &middot;{' '}
              {lessonCount} {lessonCount === 1 ? 'lesson' : 'lessons'}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1.6fr_1fr]">
        <section aria-labelledby="curriculum-heading" className="space-y-4">
          <h2 id="curriculum-heading" className="text-xl font-semibold">
            Course content
          </h2>
          <div className="space-y-3">
            {modules.map((module, moduleIndex) => {
              const isExpanded = expandedModuleId
                ? expandedModuleId === module.moduleId
                : moduleIndex === 0;
              return (
                <Card
                  key={module.moduleId}
                  className="gap-0 overflow-hidden py-0"
                >
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-muted/40 sm:px-5"
                    aria-expanded={isExpanded}
                    onClick={() =>
                      setExpandedModuleId(
                        isExpanded ? undefined : module.moduleId,
                      )
                    }
                  >
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-semibold">
                      {moduleIndex + 1}
                    </span>
                    <span className="font-semibold">{module.title}</span>
                    <Badge
                      variant="outline"
                      className="ml-1 hidden sm:inline-flex"
                    >
                      {module.lessons.length}{' '}
                      {module.lessons.length === 1 ? 'lesson' : 'lessons'}
                    </Badge>
                    <ChevronDown
                      className={`ml-auto size-4 shrink-0 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      aria-hidden="true"
                    />
                  </button>
                  {isExpanded && (
                    <CardContent className="border-t p-0">
                      {module.lessons.map((lesson) => (
                        <div
                          key={lesson.lessonId}
                          className="flex items-center gap-3 border-b px-4 py-2.5 last:border-b-0 sm:pl-12 sm:pr-5"
                        >
                          <FileText className="size-4 shrink-0 text-muted-foreground" />
                          <span className="text-sm">{lesson.title}</span>
                        </div>
                      ))}
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>
        </section>

        <aside className="lg:sticky lg:top-20 lg:self-start">
          <Card className="border-primary/20 shadow-sm">
            <CardHeader>
              <CardTitle>Ready to start learning?</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <dl className="space-y-2.5 text-sm">
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Duration</dt>
                  <dd className="font-medium">{course.duration}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Level</dt>
                  <dd className="font-medium">{course.level}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Content</dt>
                  <dd className="font-medium">
                    {modules.length} modules, {lessonCount} lessons
                  </dd>
                </div>
              </dl>
              {isAuthenticated ? (
                <Badge
                  variant="secondary"
                  className="w-full justify-center py-1.5 text-xs font-medium"
                >
                  Not yet enrolled
                </Badge>
              ) : null}
              <Button
                className="w-full"
                size="lg"
                onClick={() => setEnrolOpen(true)}
              >
                Enrol now
              </Button>
              <Button className="w-full" variant="outline" asChild>
                <Link to={backTo}>{backLabel}</Link>
              </Button>
            </CardContent>
          </Card>
        </aside>
      </div>

      <Dialog open={enrolOpen} onOpenChange={setEnrolOpen}>
        <DialogContent>
          {isAuthenticated ? (
            <>
              <DialogHeader>
                <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <CircleCheck className="size-6" />
                </div>
                <DialogTitle className="text-center">
                  You're enrolled!
                </DialogTitle>
                <DialogDescription className="text-center">
                  You've been added to {course.title}. This is a prototype — no
                  enrolment was actually saved.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="sm:justify-center">
                <DialogClose asChild>
                  <Button variant="outline">Keep browsing</Button>
                </DialogClose>
                <Button asChild>
                  <Link to="/dashboard">Go to your dashboard</Link>
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Sparkles className="size-6" />
                </div>
                <DialogTitle className="text-center">
                  Sign in to enrol
                </DialogTitle>
                <DialogDescription className="text-center">
                  Create or sign in to your account to enrol in {course.title}.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="sm:justify-center">
                <DialogClose asChild>
                  <Button variant="outline">Cancel</Button>
                </DialogClose>
                <Button asChild>
                  <Link to="/signin">Continue to sign in</Link>
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
}
