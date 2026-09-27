/**
 * Copyright Discava Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button } from '@discava/common-shadcn/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@discava/common-shadcn/components/ui/dialog';
import { Input } from '@discava/common-shadcn/components/ui/input';
import { Textarea } from '@discava/common-shadcn/components/ui/textarea';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Alert } from '../../../../../components/alert';
import { useCoreApi } from '../../../../../hooks/useCoreApi';
import { useInstructorApi } from '../../../../../hooks/useInstructorApi';
import { RichTextEditor } from './rich-text-editor';

export function EditLessonTextDialog({
  courseId,
  moduleId,
  lessonId,
  contentItemId,
  title,
  description,
  body,
  trigger,
}: {
  courseId: string;
  moduleId: string;
  lessonId: string;
  /** Set when editing an existing text item; omitted when adding a new one. */
  contentItemId?: string;
  title?: string;
  description?: string;
  body?: string;
  trigger: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [titleValue, setTitleValue] = useState(title ?? '');
  const [descriptionValue, setDescriptionValue] = useState(description ?? '');
  const [bodyValue, setBodyValue] = useState(body);
  const [saveError, setSaveError] = useState<string>();
  const { course } = useCoreApi();
  const { contentItem } = useInstructorApi();
  const queryClient = useQueryClient();

  const { mutateAsync: createLessonContentItem, isPending: isCreating } =
    useMutation(contentItem.createText.mutationOptions());
  const { mutateAsync: updateLessonContentItem, isPending: isUpdating } =
    useMutation(contentItem.updateText.mutationOptions());
  const isSaving = isCreating || isUpdating;

  const canSave = titleValue.trim().length > 0 && Boolean(bodyValue);

  const handleSave = async () => {
    setSaveError(undefined);
    if (!bodyValue) {
      return;
    }
    try {
      if (contentItemId) {
        await updateLessonContentItem({
          courseId,
          moduleId,
          lessonId,
          contentItemId,
          title: titleValue.trim(),
          description: descriptionValue || undefined,
          body: bodyValue,
        });
      } else {
        await createLessonContentItem({
          courseId,
          moduleId,
          lessonId,
          title: titleValue.trim(),
          description: descriptionValue || undefined,
          body: bodyValue,
        });
      }
      await queryClient.invalidateQueries({
        queryKey: course.view.queryKey({ courseId }),
      });
      setOpen(false);
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : "Couldn't save the text",
      );
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) {
          setTitleValue(title ?? '');
          setDescriptionValue(description ?? '');
          setBodyValue(body);
        }
        if (!nextOpen) {
          setSaveError(undefined);
        }
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{contentItemId ? 'Edit text' : 'Add text'}</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Write a rich text block for students to read in this lesson.
          </p>
        </DialogHeader>

        {saveError && (
          <Alert type="error" header="Couldn't save the text">
            {saveError}
          </Alert>
        )}

        <div className="space-y-2">
          <label
            className="text-sm font-medium leading-none"
            htmlFor="lesson-text-title"
          >
            Title
          </label>
          <Input
            id="lesson-text-title"
            value={titleValue}
            onChange={(event) => setTitleValue(event.target.value)}
            placeholder="e.g. Key concepts"
            autoFocus
          />
        </div>

        <div className="space-y-2">
          <label
            className="text-sm font-medium leading-none"
            htmlFor="lesson-text-description"
          >
            Description
          </label>
          <Textarea
            id="lesson-text-description"
            value={descriptionValue}
            onChange={(event) => setDescriptionValue(event.target.value)}
            placeholder="Optional notes for students"
            rows={2}
          />
        </div>

        <div className="space-y-2">
          <span className="text-sm font-medium leading-none">Body</span>
          <RichTextEditor value={bodyValue} onChange={setBodyValue} />
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!canSave || isSaving}
            onClick={handleSave}
          >
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Confirms before removing a text item from a lesson, same treatment as
 * RemoveLessonVideoButton gives videos.
 */
export function RemoveLessonTextButton({
  courseId,
  moduleId,
  lessonId,
  contentItemId,
  title,
}: {
  courseId: string;
  moduleId: string;
  lessonId: string;
  contentItemId: string;
  title: string;
}) {
  const [open, setOpen] = useState(false);
  const { course } = useCoreApi();
  const { contentItem } = useInstructorApi();
  const queryClient = useQueryClient();
  const {
    mutateAsync: removeContentItem,
    reset: resetRemoveContentItem,
    isPending,
    isError,
    error,
  } = useMutation(contentItem.delete.mutationOptions());

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          resetRemoveContentItem();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          type="button"
          aria-label={`Remove ${title}`}
          className="-ml-2 transition-opacity sm:opacity-0 sm:group-hover/resource:opacity-100 focus-visible:opacity-100"
        >
          <Trash2 />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Remove text</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to remove "{title}"? This can't be undone.
          </p>
        </DialogHeader>

        {isError && (
          <Alert type="error" header="Couldn't remove the text">
            {error.message}
          </Alert>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={isPending}
            onClick={async () => {
              try {
                await removeContentItem({
                  courseId,
                  moduleId,
                  lessonId,
                  contentItemId,
                });
              } catch {
                // Surfaced via the error above; keep the dialog open.
                return;
              }
              setOpen(false);
              void queryClient.invalidateQueries({
                queryKey: course.view.queryKey({ courseId }),
              });
            }}
          >
            {isPending ? 'Removing...' : 'Remove text'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
