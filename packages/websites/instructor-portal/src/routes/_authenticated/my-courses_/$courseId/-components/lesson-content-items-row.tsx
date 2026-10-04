/**
 * Copyright Discava Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { Button } from '@discava/common-shadcn/components/ui/button';
import { FileText, PencilLine, Video } from 'lucide-react';
import {
  AttachLessonVideoDialog,
  RemoveLessonVideoButton,
} from './attach-lesson-video-dialog';
import {
  EditLessonTextDialog,
  RemoveLessonTextButton,
} from './edit-lesson-text-dialog';
import { HiddenBadge } from './hidden-badge';
import { ContentItemVisibilityButton } from './visibility-buttons';

export function LessonContentItemsRow({
  courseId,
  moduleId,
  lessonId,
  contentItems,
  archive,
  readOnly = false,
  draft = false,
}: {
  courseId: string;
  moduleId: string;
  lessonId: string;
  contentItems: {
    contentItemId: string;
    type: string;
    title: string;
    description?: string;
    body?: string;
    status: string;
    visibility: 'hidden' | 'visible';
  }[];
  // Whether removing a content item archives it (any course but a draft).
  archive: boolean;
  // An archived course can't be edited: no add, edit or remove controls.
  readOnly?: boolean;
  // A draft isn't open to students yet, which changes what Publish/Hide mean.
  draft?: boolean;
}) {
  return (
    <div className="bg-muted/15 pb-3 pl-12 pr-4 sm:pl-24 sm:pr-5">
      {contentItems.map((item) =>
        item.type === 'video' ? (
          <div
            key={item.contentItemId}
            className="group/resource flex items-center gap-2 border-l px-3 py-2 transition-colors hover:bg-muted/50"
          >
            <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
              <Video className="size-3.5" />
            </div>
            <span className="flex-1 truncate text-xs font-medium">
              {item.title}
            </span>
            {item.visibility === 'hidden' && <HiddenBadge />}
            {!readOnly && (
              <>
                <ContentItemVisibilityButton
                  courseId={courseId}
                  moduleId={moduleId}
                  lessonId={lessonId}
                  contentItemId={item.contentItemId}
                  noun="video"
                  title={item.title}
                  visibility={item.visibility}
                  draft={draft}
                  className="transition-opacity sm:opacity-0 sm:group-hover/resource:opacity-100 focus-visible:opacity-100"
                />
                <AttachLessonVideoDialog
                  courseId={courseId}
                  moduleId={moduleId}
                  lessonId={lessonId}
                  contentItemId={item.contentItemId}
                  title={item.title}
                  description={item.description}
                  status={item.status}
                  trigger={
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      type="button"
                      aria-label={`Edit ${item.title}`}
                      className="transition-opacity sm:opacity-0 sm:group-hover/resource:opacity-100 focus-visible:opacity-100"
                    >
                      <PencilLine />
                    </Button>
                  }
                />
                <RemoveLessonVideoButton
                  courseId={courseId}
                  moduleId={moduleId}
                  lessonId={lessonId}
                  contentItemId={item.contentItemId}
                  title={item.title}
                  archive={archive}
                />
              </>
            )}
          </div>
        ) : (
          <div
            key={item.contentItemId}
            className="group/resource flex items-center gap-2 border-l px-3 py-2 transition-colors hover:bg-muted/50"
          >
            <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
              <FileText className="size-3.5" />
            </div>
            <span className="flex-1 truncate text-xs font-medium">
              {item.title}
            </span>
            {item.visibility === 'hidden' && <HiddenBadge />}
            {!readOnly && (
              <>
                <ContentItemVisibilityButton
                  courseId={courseId}
                  moduleId={moduleId}
                  lessonId={lessonId}
                  contentItemId={item.contentItemId}
                  noun="text"
                  title={item.title}
                  visibility={item.visibility}
                  draft={draft}
                  className="transition-opacity sm:opacity-0 sm:group-hover/resource:opacity-100 focus-visible:opacity-100"
                />
                <EditLessonTextDialog
                  courseId={courseId}
                  moduleId={moduleId}
                  lessonId={lessonId}
                  contentItemId={item.contentItemId}
                  title={item.title}
                  description={item.description}
                  body={item.body}
                  trigger={
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      type="button"
                      aria-label={`Edit ${item.title}`}
                      className="transition-opacity sm:opacity-0 sm:group-hover/resource:opacity-100 focus-visible:opacity-100"
                    >
                      <PencilLine />
                    </Button>
                  }
                />
                <RemoveLessonTextButton
                  courseId={courseId}
                  moduleId={moduleId}
                  lessonId={lessonId}
                  contentItemId={item.contentItemId}
                  title={item.title}
                  archive={archive}
                />
              </>
            )}
          </div>
        ),
      )}
      {!readOnly && (
        <div className="flex flex-wrap gap-2 border-l px-3 pt-2">
          <AttachLessonVideoDialog
            courseId={courseId}
            moduleId={moduleId}
            lessonId={lessonId}
            trigger={
              <Button variant="outline" size="sm" type="button">
                <Video /> Video
              </Button>
            }
          />
          <EditLessonTextDialog
            courseId={courseId}
            moduleId={moduleId}
            lessonId={lessonId}
            trigger={
              <Button variant="outline" size="sm" type="button">
                <FileText /> Text
              </Button>
            }
          />
        </div>
      )}
    </div>
  );
}
