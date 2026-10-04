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
import { RotateCcw, Send } from 'lucide-react';
import { useState } from 'react';
import { Alert } from '../../../../../components/alert';
import { useInstructorApi } from '../../../../../hooks/useInstructorApi';

// Publish for a draft course, Restore for an archived one. A published course
// has neither.
export function CourseStatusActions({
  courseId,
  title,
  status,
}: {
  courseId: string;
  title: string;
  status: 'draft' | 'published' | 'archived';
}) {
  if (status === 'draft') {
    return <PublishCourseDialog courseId={courseId} title={title} />;
  }
  if (status === 'archived') {
    return <RestoreCourseButton courseId={courseId} />;
  }
  return null;
}

function PublishCourseDialog({
  courseId,
  title,
}: {
  courseId: string;
  title: string;
}) {
  const [open, setOpen] = useState(false);
  const { course } = useInstructorApi();
  const queryClient = useQueryClient();
  const {
    mutateAsync: publishCourse,
    reset: resetPublishCourse,
    isPending,
    isError,
    error,
  } = useMutation(course.publish.mutationOptions());

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          resetPublishCourse();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button type="button">
          <Send /> Publish
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Publish course</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Students will be able to see "{title}" and everything in it. After
            this, removing a module, lesson or content item archives it instead
            of deleting it, and new content stays hidden until you publish it.
          </p>
        </DialogHeader>

        {isError && (
          <Alert type="error" header="Couldn't publish the course">
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
            disabled={isPending}
            onClick={async () => {
              try {
                await publishCourse({ courseId });
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
            {isPending ? 'Publishing...' : 'Publish'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RestoreCourseButton({ courseId }: { courseId: string }) {
  const { course } = useInstructorApi();
  const queryClient = useQueryClient();
  const {
    mutateAsync: restoreCourse,
    isPending,
    isError,
    error,
  } = useMutation(course.restore.mutationOptions());

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        disabled={isPending}
        onClick={async () => {
          try {
            await restoreCourse({ courseId });
          } catch {
            // Surfaced via the error below.
            return;
          }
          void queryClient.invalidateQueries({
            queryKey: course.view.queryKey({ courseId }),
          });
        }}
      >
        <RotateCcw /> {isPending ? 'Restoring...' : 'Restore'}
      </Button>
      {isError && (
        <Alert type="error" header="Couldn't restore the course">
          {error.message}
        </Alert>
      )}
    </div>
  );
}
