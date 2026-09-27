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

export function DeleteModuleDialog({
  courseId,
  moduleId,
  title,
  lessonCount,
  trigger,
}: {
  courseId: string;
  moduleId: string;
  title: string;
  lessonCount: number;
  trigger: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const { course } = useCoreApi();
  const { module } = useInstructorApi();
  const queryClient = useQueryClient();
  const {
    mutateAsync: deleteModule,
    reset: resetDeleteModule,
    isPending,
    isError,
    error,
  } = useMutation(module.delete.mutationOptions());

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          resetDeleteModule();
        }
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete module</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete "{title}"?{' '}
            {lessonCount > 0
              ? `This will also delete ${lessonCount} ${lessonCount === 1 ? 'lesson' : 'lessons'} inside it. `
              : ''}
            This can't be undone.
          </p>
        </DialogHeader>

        {isError && (
          <Alert type="error" header="Couldn't delete the module">
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
                await deleteModule({ courseId, moduleId });
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
            {isPending ? 'Deleting...' : 'Delete module'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
