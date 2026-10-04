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
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import { Alert } from '../../../../../components/alert';
import { useInstructorApi } from '../../../../../hooks/useInstructorApi';
import { studentActivityNote } from './student-activity';

export function DeleteLessonDialog({
  courseId,
  moduleId,
  lessonId,
  title,
  archive,
  usedItems = 0,
  trigger,
}: {
  courseId: string;
  moduleId: string;
  lessonId: string;
  title: string;
  // Outside a draft course, delete archives the lesson instead: students
  // stop seeing it, but it and their data for it are kept and restorable.
  archive: boolean;
  // How many of its items students have used, for the warning on archiving.
  usedItems?: number;
  trigger: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const { course, lesson } = useInstructorApi();
  const queryClient = useQueryClient();
  const {
    mutateAsync: deleteLesson,
    reset: resetDeleteLesson,
    isPending,
    isError,
    error,
  } = useMutation(lesson.delete.mutationOptions());

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          resetDeleteLesson();
        }
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {archive ? 'Archive lesson' : 'Delete lesson'}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            {archive
              ? `Students will no longer see "${title}" or its content. Their progress and results are kept, and the lesson can be restored.`
              : `Are you sure you want to delete "${title}"? This can't be undone.`}
          </p>
          {archive && studentActivityNote({ items: usedItems }) && (
            <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
              {studentActivityNote({ items: usedItems })}. Their progress is
              kept, and counts again if it's restored.
            </p>
          )}
        </DialogHeader>

        {isError && (
          <Alert
            type="error"
            header={
              archive
                ? "Couldn't archive the lesson"
                : "Couldn't delete the lesson"
            }
          >
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
            variant={archive ? 'default' : 'destructive'}
            disabled={isPending}
            onClick={async () => {
              try {
                await deleteLesson({ courseId, moduleId, lessonId });
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
            {archive
              ? isPending
                ? 'Archiving...'
                : 'Archive lesson'
              : isPending
                ? 'Deleting...'
                : 'Delete lesson'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
