/**
 * Copyright Discava Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button } from '@discava/common-shadcn/components/ui/button';
import { Input } from '@discava/common-shadcn/components/ui/input';
import { Textarea } from '@discava/common-shadcn/components/ui/textarea';
import { cn } from '@discava/common-shadcn/lib/utils';
import { move } from '@dnd-kit/helpers';
import { DragDropProvider, type DragEndEvent } from '@dnd-kit/react';
import { useSortable } from '@dnd-kit/react/sortable';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CirclePlus, Save } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Alert } from '../../../../../../components/alert';
import { useInstructorApi } from '../../../../../../hooks/useInstructorApi';
import { QuestionCard, QuestionHandle } from './question-card';
import {
  fromQuizItem,
  hasErrors,
  MAX_QUESTIONS,
  newQuestion,
  newQuiz,
  plainText,
  type QuestionState,
  type QuizItem,
  type QuizState,
  type RevealAnswers,
  toQuizInput,
  validateQuiz,
} from './quiz-form';

const REVEAL_LABELS: Record<RevealAnswers, string> = {
  after_each_attempt: 'After each attempt',
  after_final_attempt: 'After the last attempt',
  never: 'Never',
};

// Builds a new quiz or edits an existing one. The whole quiz -- settings,
// questions and answer key -- is saved together, so a save never pairs a new
// key with old questions.
export function QuizBuilder({
  courseId,
  moduleId,
  lessonId,
  contentItemId,
  quiz: existing,
  studentActivityCount = 0,
  readOnlyReason,
  onDirtyChange,
  onCreated,
  onReload,
}: {
  courseId: string;
  moduleId: string;
  lessonId: string;
  // Absent for a new quiz.
  contentItemId?: string;
  quiz?: QuizItem;
  // Students who have attempted it, for the warning about editing it.
  studentActivityCount?: number;
  // Why the quiz can't be edited (an archived course, module, lesson or
  // quiz), or nothing if it can.
  readOnlyReason?: string;
  // Whether there are unsaved changes, whenever that changes.
  onDirtyChange?: (dirty: boolean) => void;
  // After the first save of a new quiz, with the id it was given.
  onCreated?: (contentItemId: string) => void;
  // Fetches the quiz again, after a CONFLICT.
  onReload: () => void;
}) {
  const { course, contentItem } = useInstructorApi();
  const queryClient = useQueryClient();
  const initial = useMemo(
    () => (existing ? fromQuizItem(existing) : newQuiz()),
    [existing],
  );
  const [quiz, setQuiz] = useState<QuizState>(initial);
  const [saved, setSaved] = useState<QuizState>(initial);
  // A new quiz has neither until its first save creates it.
  const [savedId, setSavedId] = useState(contentItemId);
  const [version, setVersion] = useState(existing?.quizVersion);
  const [expanded, setExpanded] = useState<string | undefined>(
    initial.questions[0]?.questionId,
  );
  const [showProblems, setShowProblems] = useState(false);
  // The question (or 'settings') to scroll to once it has rendered open.
  const [scrollTarget, setScrollTarget] = useState<string>();
  const [justSaved, setJustSaved] = useState(false);
  const createQuiz = useMutation(contentItem.createQuiz.mutationOptions());
  const updateQuiz = useMutation(contentItem.updateQuiz.mutationOptions());
  const saving = createQuiz.isPending || updateQuiz.isPending;
  const saveError = createQuiz.error ?? updateQuiz.error;
  const readOnly = Boolean(readOnlyReason);

  const errors = validateQuiz(quiz);
  const dirty = JSON.stringify(quiz) !== JSON.stringify(saved);

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  // Leaving with unsaved changes asks first.
  useEffect(() => {
    if (!dirty || readOnly) {
      return;
    }
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, readOnly]);

  useEffect(() => {
    if (!scrollTarget) {
      return;
    }
    document
      .getElementById(sectionId(scrollTarget))
      // jsdom has no scrollIntoView.
      ?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    setScrollTarget(undefined);
  }, [scrollTarget]);

  // Opens a question (collapsing the open one) and scrolls to it.
  const jumpTo = (questionId: string) => {
    setExpanded(questionId);
    setScrollTarget(questionId);
  };

  const change = (next: Partial<QuizState>) => {
    setJustSaved(false);
    setQuiz((current) => ({ ...current, ...next }));
  };
  const changeSettings = (next: Partial<QuizState['settings']>) =>
    change({ settings: { ...quiz.settings, ...next } });
  const changeQuestion = (question: QuestionState) =>
    change({
      questions: quiz.questions.map((current) =>
        current.questionId === question.questionId ? question : current,
      ),
    });

  const save = async () => {
    createQuiz.reset();
    updateQuiz.reset();
    if (hasErrors(errors)) {
      setShowProblems(true);
      const firstWithProblems = quiz.questions.find(
        ({ questionId }) => errors.questions[questionId],
      );
      if (firstWithProblems) {
        setExpanded(firstWithProblems.questionId);
      }
      return;
    }
    const input = toQuizInput(quiz);
    try {
      const result =
        savedId === undefined || version === undefined
          ? await createQuiz.mutateAsync({
              courseId,
              moduleId,
              lessonId,
              ...input,
            })
          : await updateQuiz.mutateAsync({
              courseId,
              moduleId,
              lessonId,
              contentItemId: savedId,
              quizVersion: version,
              ...input,
            });
      // Once created, later saves update it.
      if (savedId === undefined) {
        onCreated?.(result.contentItemId);
      }
      setSavedId(result.contentItemId);
      setVersion(result.quizVersion);
      setSaved(quiz);
      setJustSaved(true);
      void queryClient.invalidateQueries({
        queryKey: course.view.queryKey({ courseId }),
      });
    } catch {
      // Shown below.
    }
  };

  const onDragEnd = (event: DragEndEvent) => {
    if (event.canceled) {
      return;
    }
    const ids = quiz.questions.map(({ questionId }) => questionId);
    const next = move(ids, event);
    change({
      questions: next.flatMap(
        (id) =>
          quiz.questions.find(({ questionId }) => questionId === id) ?? [],
      ),
    });
  };

  return (
    <div className="space-y-6">
      {readOnlyReason && (
        <Alert header="This quiz can't be edited">{readOnlyReason}</Alert>
      )}
      {!readOnly && studentActivityCount > 0 && (
        <Alert
          header={`${studentActivityCount} ${studentActivityCount === 1 ? 'student has' : 'students have'} attempted this quiz`}
        >
          Their attempts and best scores are kept, and never regraded. Changing
          the questions makes anyone mid-attempt review the quiz before
          submitting; changing only the answer key or explanations doesn't
          interrupt them.
        </Alert>
      )}

      <div className="sm:grid sm:grid-cols-[13rem_minmax(0,1fr)] sm:gap-6">
        <nav
          aria-label="Quiz contents"
          className="sticky top-0 hidden max-h-[calc(90vh-3rem)] self-start overflow-y-auto sm:block"
        >
          <ol className="space-y-0.5 text-sm">
            <li>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setScrollTarget('settings')}
                className="w-full justify-start px-2"
              >
                Settings
              </Button>
            </li>
            {quiz.questions.map((question, index) => {
              const needsFixing =
                showProblems && Boolean(errors.questions[question.questionId]);
              return (
                <li key={question.questionId}>
                  <Button
                    type="button"
                    variant="ghost"
                    aria-current={
                      expanded === question.questionId ? 'true' : undefined
                    }
                    onClick={() => jumpTo(question.questionId)}
                    className={cn(
                      'h-auto w-full items-start justify-start gap-2 px-2 py-1.5 text-left font-normal whitespace-normal',
                      expanded === question.questionId && 'bg-muted',
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-semibold">
                        Question {index + 1}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {plainText(question.prompt) ||
                          'No question written yet'}
                      </span>
                    </span>
                    {needsFixing && (
                      <span className="mt-1 size-2 shrink-0 rounded-full bg-destructive">
                        <span className="sr-only">(needs fixing)</span>
                      </span>
                    )}
                  </Button>
                </li>
              );
            })}
          </ol>
        </nav>

        <div className="min-w-0 space-y-6">
          <section
            id={sectionId('settings')}
            aria-labelledby="quiz-settings"
            className="scroll-mt-4 space-y-4 rounded-xl border bg-card p-5"
          >
            <h2 id="quiz-settings" className="text-lg font-semibold">
              Settings
            </h2>
            <fieldset disabled={readOnly} className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-1.5 sm:col-span-2">
                <span className="text-sm font-medium">Title</span>
                <Input
                  value={quiz.title}
                  onChange={(event) => change({ title: event.target.value })}
                  maxLength={200}
                />
              </label>
              <label className="space-y-1.5 sm:col-span-2">
                <span className="text-sm font-medium">
                  Description (optional)
                </span>
                <Textarea
                  value={quiz.description}
                  onChange={(event) =>
                    change({ description: event.target.value })
                  }
                  rows={2}
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-sm font-medium">Pass mark (%)</span>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={
                    Number.isNaN(quiz.settings.passMarkPercent)
                      ? ''
                      : quiz.settings.passMarkPercent
                  }
                  onChange={(event) =>
                    changeSettings({
                      passMarkPercent: event.target.valueAsNumber,
                    })
                  }
                />
              </label>
              <div className="space-y-1.5">
                <span className="text-sm font-medium">Attempts allowed</span>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={quiz.settings.attemptsAllowed === null}
                      onChange={(event) =>
                        changeSettings({
                          attemptsAllowed: event.target.checked ? null : 3,
                        })
                      }
                      className="size-4 accent-primary"
                    />
                    Unlimited
                  </label>
                  {quiz.settings.attemptsAllowed !== null && (
                    <Input
                      type="number"
                      min={1}
                      step={1}
                      aria-label="Number of attempts"
                      className="w-24"
                      value={
                        Number.isNaN(quiz.settings.attemptsAllowed)
                          ? ''
                          : quiz.settings.attemptsAllowed
                      }
                      onChange={(event) =>
                        changeSettings({
                          attemptsAllowed: event.target.valueAsNumber,
                        })
                      }
                    />
                  )}
                </div>
              </div>
              <label className="space-y-1.5">
                <span className="text-sm font-medium">
                  Show the correct answers
                </span>
                <select
                  value={quiz.settings.revealAnswers}
                  onChange={(event) =>
                    changeSettings({
                      revealAnswers: event.target.value as RevealAnswers,
                    })
                  }
                  className="block h-9 w-full rounded-md border bg-background px-3 text-sm"
                >
                  {Object.entries(REVEAL_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 self-end text-sm">
                <input
                  type="checkbox"
                  checked={quiz.settings.shuffleOptions}
                  onChange={(event) =>
                    changeSettings({ shuffleOptions: event.target.checked })
                  }
                  className="size-4 accent-primary"
                />
                Shuffle the options for each student
              </label>
            </fieldset>
          </section>

          <section aria-labelledby="quiz-questions" className="space-y-3">
            <h2 id="quiz-questions" className="text-lg font-semibold">
              Questions ({quiz.questions.length})
            </h2>
            <DragDropProvider onDragEnd={onDragEnd}>
              <ol className="space-y-3">
                {quiz.questions.map((question, index) => (
                  <SortableQuestion
                    key={question.questionId}
                    id={question.questionId}
                    elementId={sectionId(question.questionId)}
                    index={index}
                    label={`Question ${index + 1}`}
                    disabled={readOnly || quiz.questions.length < 2}
                  >
                    {(handle) => (
                      <QuestionCard
                        question={question}
                        number={index + 1}
                        expanded={expanded === question.questionId}
                        onToggle={() =>
                          setExpanded((current) =>
                            current === question.questionId
                              ? undefined
                              : question.questionId,
                          )
                        }
                        onChange={changeQuestion}
                        onRemove={() =>
                          change({
                            questions: quiz.questions.filter(
                              ({ questionId }) =>
                                questionId !== question.questionId,
                            ),
                          })
                        }
                        canRemove={quiz.questions.length > 1}
                        problems={
                          showProblems
                            ? (errors.questions[question.questionId] ?? [])
                            : []
                        }
                        readOnly={readOnly}
                        handle={handle}
                      />
                    )}
                  </SortableQuestion>
                ))}
              </ol>
            </DragDropProvider>
            {!readOnly && (
              <Button
                type="button"
                variant="outline"
                disabled={quiz.questions.length >= MAX_QUESTIONS}
                onClick={() => {
                  const question = newQuestion();
                  change({ questions: [...quiz.questions, question] });
                  jumpTo(question.questionId);
                }}
              >
                <CirclePlus /> Add question
              </Button>
            )}
          </section>
        </div>
      </div>

      {!readOnly && (
        <div className="sticky bottom-0 space-y-3 border-t bg-background/95 py-4 backdrop-blur">
          {showProblems && errors.quiz.length > 0 && (
            <Alert type="error" header="Fix these before saving">
              <ul className="list-disc pl-5">
                {errors.quiz.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            </Alert>
          )}
          {showProblems && Object.keys(errors.questions).length > 0 && (
            <p role="alert" className="text-sm text-destructive">
              {Object.keys(errors.questions).length === 1
                ? '1 question needs fixing'
                : `${Object.keys(errors.questions).length} questions need fixing`}{' '}
              before the quiz can be saved.
            </p>
          )}
          {saveError &&
            (saveError.data?.code === 'CONFLICT' ? (
              <Alert
                type="error"
                header="This quiz changed since you opened it"
              >
                <p>
                  Someone saved it in the meantime. Reload to get the latest
                  version; your unsaved changes here will be lost.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={onReload}
                >
                  Reload the quiz
                </Button>
              </Alert>
            ) : (
              <Alert type="error" header="Couldn't save the quiz">
                {saveError.message}
              </Alert>
            ))}
          <div className="flex items-center justify-end gap-3">
            <span className="text-sm text-muted-foreground" role="status">
              {justSaved ? 'Saved' : dirty ? 'Unsaved changes' : ''}
            </span>
            <Button type="button" disabled={saving} onClick={save}>
              <Save /> {saving ? 'Saving...' : 'Save quiz'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// The element id a contents link scrolls to.
const sectionId = (target: string) => `quiz-section-${target}`;

function SortableQuestion({
  id,
  elementId,
  index,
  label,
  disabled,
  children,
}: {
  id: string;
  elementId: string;
  index: number;
  label: string;
  disabled: boolean;
  children: (handle: React.ReactNode) => React.ReactNode;
}) {
  const { ref, handleRef } = useSortable({ id, index, disabled });
  // The handle is always rendered, disabled when there's nothing to reorder:
  // without one, dnd-kit makes the whole card the drag source, a (disabled)
  // button to assistive tech, with every field inside it.
  return (
    <li ref={ref} id={elementId} className="scroll-mt-4">
      {children(
        <QuestionHandle
          label={label}
          handleRef={handleRef}
          disabled={disabled}
        />,
      )}
    </li>
  );
}
