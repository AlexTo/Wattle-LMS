/**
 * Copyright Discava Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Badge } from '@discava/common-shadcn/components/ui/badge';
import { Button } from '@discava/common-shadcn/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@discava/common-shadcn/components/ui/dialog';
import { Input } from '@discava/common-shadcn/components/ui/input';
import { cn } from '@discava/common-shadcn/lib/utils';
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  CirclePlus,
  GripVertical,
  Trash2,
  X,
} from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { RichTextEditor } from '../rich-text-editor';
import {
  EMPTY_DOC,
  MAX_OPTIONS,
  MIN_OPTIONS,
  newOption,
  plainText,
  type QuestionKind,
  type QuestionState,
} from './quiz-form';

const move = <T,>(items: T[], from: number, to: number) => {
  const next = items.slice();
  next.splice(to, 0, next.splice(from, 1)[0]);
  return next;
};

export function QuestionCard({
  question,
  number,
  expanded,
  onToggle,
  onChange,
  onRemove,
  canRemove,
  problems,
  readOnly,
  handle,
}: {
  question: QuestionState;
  // 1-based position, for labels: "Question 2".
  number: number;
  expanded: boolean;
  onToggle: () => void;
  onChange: (question: QuestionState) => void;
  onRemove: () => void;
  // A quiz needs at least one question, so the last one can't be removed.
  canRemove: boolean;
  // What's wrong with it, shown once the instructor has tried to save.
  problems: string[];
  readOnly: boolean;
  // The drag handle for reordering questions, or nothing.
  handle?: ReactNode;
}) {
  const label = `Question ${number}`;
  const [keepChoice, setKeepChoice] = useState<string>();
  const [askWhichToKeep, setAskWhichToKeep] = useState(false);
  const update = (change: Partial<QuestionState>) =>
    onChange({ ...question, ...change });

  const setKind = (kind: QuestionKind) => {
    if (kind === question.kind) {
      return;
    }
    const correct = question.options.filter(({ optionId }) =>
      question.correct.includes(optionId),
    );
    // Single choice has exactly one correct option: ask which to keep.
    if (kind === 'single' && correct.length > 1) {
      setKeepChoice(correct[0].optionId);
      setAskWhichToKeep(true);
      return;
    }
    update({ kind });
  };

  const setCorrect = (optionId: string, checked: boolean) =>
    update({
      correct:
        question.kind === 'single'
          ? checked
            ? [optionId]
            : []
          : checked
            ? [...question.correct, optionId]
            : question.correct.filter((id) => id !== optionId),
    });

  const setOption = (index: number, text: string) =>
    update({
      options: question.options.map((option, i) =>
        i === index ? { ...option, text } : option,
      ),
    });

  const removeOption = (index: number) => {
    const { optionId } = question.options[index];
    update({
      options: question.options.filter((_, i) => i !== index),
      correct: question.correct.filter((id) => id !== optionId),
    });
  };

  const summary = plainText(question.prompt) || 'No question written yet';

  return (
    <div
      className={cn(
        'rounded-xl border bg-card',
        problems.length > 0 && 'border-destructive/60',
      )}
    >
      <div className="flex items-center gap-2 px-3 py-2">
        {handle}
        <span className="text-sm font-semibold">{label}</span>
        <Badge variant="outline" className="text-[10px]">
          {question.kind === 'single' ? 'Single choice' : 'Multiple choice'}
        </Badge>
        {!expanded && (
          <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
            {summary}
          </span>
        )}
        {problems.length > 0 && (
          <Badge variant="destructive" className="text-[10px]">
            {problems.length} to fix
          </Badge>
        )}
        <div className="ml-auto flex items-center gap-1">
          {!readOnly && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Remove ${label}`}
              disabled={!canRemove}
              onClick={onRemove}
            >
              <Trash2 />
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-expanded={expanded}
            aria-label={`${expanded ? 'Collapse' : 'Expand'} ${label}`}
            onClick={onToggle}
          >
            {expanded ? <ChevronUp /> : <ChevronDown />}
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="space-y-4 border-t px-4 py-4">
          {problems.length > 0 && (
            <ul className="list-disc space-y-0.5 pl-5 text-sm text-destructive">
              {problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          )}

          <div className="space-y-1.5">
            <p className="text-sm font-medium">Question</p>
            {readOnly ? (
              <p className="rounded-lg border px-3 py-2 text-sm">{summary}</p>
            ) : (
              // Mounted only while the card is expanded, so a long quiz
              // doesn't run an editor per question.
              <RichTextEditor
                value={question.prompt}
                onChange={(prompt) => update({ prompt })}
                ariaLabel={label}
                minHeightClass="min-h-16"
              />
            )}
          </div>

          <fieldset className="space-y-2" disabled={readOnly}>
            <legend className="text-sm font-medium">Answers</legend>
            <div
              role="radiogroup"
              aria-label={`${label} type`}
              className="inline-flex rounded-lg border p-0.5"
            >
              {(['single', 'multiple'] as const).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  role="radio"
                  aria-checked={question.kind === kind}
                  onClick={() => setKind(kind)}
                  className={cn(
                    'rounded-md px-3 py-1 text-xs font-medium',
                    question.kind === kind
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {kind === 'single' ? 'Single choice' : 'Multiple choice'}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {question.kind === 'single'
                ? 'Mark the one correct option.'
                : 'Mark every correct option. Students are told to select all that apply.'}
            </p>
            <ol className="space-y-2">
              {question.options.map((option, index) => (
                <li key={option.optionId} className="flex items-center gap-2">
                  <input
                    type={question.kind === 'single' ? 'radio' : 'checkbox'}
                    name={`correct-${question.questionId}`}
                    checked={question.correct.includes(option.optionId)}
                    onChange={(event) =>
                      setCorrect(option.optionId, event.target.checked)
                    }
                    aria-label={`Option ${index + 1} is correct`}
                    className="size-4 shrink-0 accent-primary"
                  />
                  <Input
                    value={option.text}
                    onChange={(event) => setOption(index, event.target.value)}
                    aria-label={`Option ${index + 1}`}
                    placeholder={`Option ${index + 1}`}
                    maxLength={500}
                  />
                  {!readOnly && (
                    <>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Move option ${index + 1} up`}
                        disabled={index === 0}
                        onClick={() =>
                          update({
                            options: move(question.options, index, index - 1),
                          })
                        }
                      >
                        <ArrowUp />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Move option ${index + 1} down`}
                        disabled={index === question.options.length - 1}
                        onClick={() =>
                          update({
                            options: move(question.options, index, index + 1),
                          })
                        }
                      >
                        <ArrowDown />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Remove option ${index + 1}`}
                        disabled={question.options.length <= MIN_OPTIONS}
                        onClick={() => removeOption(index)}
                      >
                        <X />
                      </Button>
                    </>
                  )}
                </li>
              ))}
            </ol>
            {!readOnly && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={question.options.length >= MAX_OPTIONS}
                onClick={() =>
                  update({ options: [...question.options, newOption()] })
                }
              >
                <CirclePlus /> Add option
              </Button>
            )}
          </fieldset>

          <div className="space-y-1.5">
            <p className="text-sm font-medium">Explanation (optional)</p>
            <p className="text-xs text-muted-foreground">
              Shown with the answers, when the quiz reveals them.
            </p>
            {readOnly ? (
              <p className="rounded-lg border px-3 py-2 text-sm">
                {plainText(question.explanation) || 'None'}
              </p>
            ) : question.explanation ? (
              <>
                <RichTextEditor
                  value={question.explanation}
                  onChange={(explanation) => update({ explanation })}
                  ariaLabel={`${label} explanation`}
                  minHeightClass="min-h-16"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => update({ explanation: '' })}
                >
                  Remove explanation
                </Button>
              </>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => update({ explanation: EMPTY_DOC })}
              >
                <CirclePlus /> Add explanation
              </Button>
            )}
          </div>
        </div>
      )}

      <Dialog open={askWhichToKeep} onOpenChange={setAskWhichToKeep}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Which answer stays correct?</DialogTitle>
            <p className="text-sm text-muted-foreground">
              A single choice question has one correct option. Choose the one to
              keep; the others will be marked incorrect.
            </p>
          </DialogHeader>
          <fieldset className="space-y-2">
            <legend className="sr-only">Correct option to keep</legend>
            {question.options
              .filter(({ optionId }) => question.correct.includes(optionId))
              .map((option) => (
                <label
                  key={option.optionId}
                  className="flex items-center gap-2 text-sm"
                >
                  <input
                    type="radio"
                    name={`keep-${question.questionId}`}
                    checked={keepChoice === option.optionId}
                    onChange={() => setKeepChoice(option.optionId)}
                    className="size-4 accent-primary"
                  />
                  {option.text ||
                    `Option ${question.options.indexOf(option) + 1}`}
                </label>
              ))}
          </fieldset>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setAskWhichToKeep(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                update({
                  kind: 'single',
                  correct: keepChoice ? [keepChoice] : [],
                });
                setAskWhichToKeep(false);
              }}
            >
              Switch to single choice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// The grip that reorders questions by drag (or the keyboard), used by the
// builder through dnd-kit.
export function QuestionHandle({
  label,
  handleRef,
  disabled,
}: {
  label: string;
  handleRef: (element: Element | null) => void;
  disabled: boolean;
}) {
  return (
    <button
      ref={handleRef}
      type="button"
      aria-label={`Reorder ${label}`}
      disabled={disabled}
      className="flex size-6 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring active:cursor-grabbing disabled:cursor-not-allowed"
    >
      <GripVertical className="size-4" />
    </button>
  );
}
