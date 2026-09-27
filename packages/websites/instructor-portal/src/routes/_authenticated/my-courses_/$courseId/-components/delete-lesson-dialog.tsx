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
import { useCoreApi } from '../../../../../hooks/useCoreApi';
import { useInstructorApi } from '../../../../../hooks/useInstructorApi';

export function DeleteLessonDialog({
  courseId,
  moduleId,
  lessonId,
  title,
  trigger,
}: {
  courseId: string;
  moduleId: string;
  lessonId: string;
  title: string;
  trigger: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const { course } = useCoreApi();
  const { lesson } = useInstructorApi();
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
          <DialogTitle>Delete lesson</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete "{title}"? This can't be undone.
          </p>
        </DialogHeader>

        {isError && (
          <Alert type="error" header="Couldn't delete the lesson">
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
            {isPending ? 'Deleting...' : 'Delete lesson'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
