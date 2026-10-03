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

export function DeleteModuleDialog({
  courseId,
  moduleId,
  title,
  lessonCount,
  archive,
  trigger,
}: {
  courseId: string;
  moduleId: string;
  title: string;
  lessonCount: number;
  // Outside a draft course, delete archives the module instead: students
  // stop seeing it, but it and their data for it are kept and restorable.
  archive: boolean;
  trigger: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const { course, module } = useInstructorApi();
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
          <DialogTitle>
            {archive ? 'Archive module' : 'Delete module'}
          </DialogTitle>
          {archive ? (
            <p className="text-sm text-muted-foreground">
              Students will no longer see "{title}" or anything in it. Their
              progress and results are kept, and the module can be restored.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete "{title}"?{' '}
              {lessonCount > 0
                ? `This will also delete ${lessonCount} ${lessonCount === 1 ? 'lesson' : 'lessons'} inside it. `
                : ''}
              This can't be undone.
            </p>
          )}
        </DialogHeader>

        {isError && (
          <Alert
            type="error"
            header={
              archive
                ? "Couldn't archive the module"
                : "Couldn't delete the module"
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
            {archive
              ? isPending
                ? 'Archiving...'
                : 'Archive module'
              : isPending
                ? 'Deleting...'
                : 'Delete module'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
