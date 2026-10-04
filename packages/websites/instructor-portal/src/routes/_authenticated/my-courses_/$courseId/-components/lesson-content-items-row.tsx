/**
 * Copyright Discava Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { Button } from '@discava/common-shadcn/components/ui/button';
import { cn } from '@discava/common-shadcn/lib/utils';
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText, GripVertical, PencilLine, Video } from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { Alert } from '../../../../../components/alert';
import { useInstructorApi } from '../../../../../hooks/useInstructorApi';
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

type ContentItem = {
  contentItemId: string;
  type: string;
  title: string;
  description?: string;
  body?: string;
  status: string;
  visibility: 'hidden' | 'visible';
};

const ROW_CLASS =
  'group/resource flex items-center gap-2 border-l px-3 py-2 transition-colors hover:bg-muted/50';

// One draggable row. The grip is the handle, so the row's own buttons keep
// working; it can also be picked up with the keyboard (Space, then the arrow
// keys, then Space to drop).
function SortableContentItem({
  id,
  title,
  disabled,
  children,
}: {
  id: string;
  title: string;
  disabled: boolean;
  children: (handle: ReactNode) => ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        ROW_CLASS,
        isDragging && 'relative z-10 bg-background shadow-md',
      )}
    >
      {children(
        <button
          ref={setActivatorNodeRef}
          type="button"
          aria-label={`Reorder ${title}`}
          className="-ml-1 flex size-6 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring active:cursor-grabbing disabled:cursor-not-allowed"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-3.5" />
        </button>,
      )}
    </div>
  );
}

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
  contentItems: ContentItem[];
  // Whether removing a content item archives it (any course but a draft).
  archive: boolean;
  // An archived course can't be edited: no add, edit or remove controls.
  readOnly?: boolean;
  // A draft isn't open to students yet, which changes what Publish/Hide mean.
  draft?: boolean;
}) {
  const { course, contentItem } = useInstructorApi();
  const queryClient = useQueryClient();
  const reorder = useMutation(contentItem.reorder.mutationOptions());
  const [reorderError, setReorderError] = useState<string>();

  // The order shown, which moves as soon as an item is dropped and follows the
  // course view whenever that changes.
  const ids = contentItems.map(({ contentItemId }) => contentItemId);
  const idsKey = ids.join(',');
  const [order, setOrder] = useState(ids);
  useEffect(() => setOrder(ids), [idsKey]);
  const byId = useMemo(
    () => new Map(contentItems.map((item) => [item.contentItemId, item])),
    [contentItems],
  );
  const items = order.flatMap((id) => byId.get(id) ?? []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const titleOf = (id: string | number) =>
    byId.get(String(id))?.title ?? 'item';
  const positionOf = (id: string | number) => order.indexOf(String(id)) + 1;
  // What a screen reader hears, using titles rather than ids.
  const announcements = {
    onDragStart: ({ active }: { active: { id: string | number } }) =>
      `Picked up ${titleOf(active.id)}, position ${positionOf(active.id)} of ${order.length}.`,
    onDragOver: ({
      active,
      over,
    }: {
      active: { id: string | number };
      over: { id: string | number } | null;
    }) =>
      over
        ? `${titleOf(active.id)} is over position ${positionOf(over.id)} of ${order.length}.`
        : `${titleOf(active.id)} is no longer over a position.`,
    onDragEnd: ({
      active,
      over,
    }: {
      active: { id: string | number };
      over: { id: string | number } | null;
    }) =>
      over
        ? `${titleOf(active.id)} dropped at position ${positionOf(over.id)} of ${order.length}.`
        : `${titleOf(active.id)} dropped back in place.`,
    onDragCancel: ({ active }: { active: { id: string | number } }) =>
      `Moving ${titleOf(active.id)} was cancelled.`,
  };

  const refreshCourse = () =>
    queryClient.invalidateQueries({
      queryKey: course.view.queryKey({ courseId }),
    });

  // Saves the whole new order in one call. On failure the order snaps back and
  // the course reloads; a CONFLICT means the lesson changed under the editor.
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) {
      return;
    }
    const previous = order;
    const next = arrayMove(
      order,
      order.indexOf(String(active.id)),
      order.indexOf(String(over.id)),
    );
    setOrder(next);
    reorder.mutate(
      { courseId, moduleId, lessonId, contentItemIds: next },
      {
        onError: (error) => {
          setOrder(previous);
          setReorderError(
            error.data?.code === 'CONFLICT'
              ? 'This lesson changed while you were reordering it. It has been reloaded, so try again.'
              : error.message,
          );
        },
        onSettled: () => {
          void refreshCourse();
        },
      },
    );
  };

  // The row's own content, beside its drag handle.
  const renderItem = (item: ContentItem, handle: ReactNode) =>
    item.type === 'video' ? (
      <>
        {handle}
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
      </>
    ) : (
      <>
        {handle}
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
      </>
    );

  return (
    <div className="bg-muted/15 pb-3 pl-12 pr-4 sm:pl-24 sm:pr-5">
      {readOnly || items.length < 2 ? (
        items.map((item) => (
          <div key={item.contentItemId} className={ROW_CLASS}>
            {renderItem(item, null)}
          </div>
        ))
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={() => setReorderError(undefined)}
          onDragEnd={onDragEnd}
          accessibility={{ announcements }}
        >
          <SortableContext items={order} strategy={verticalListSortingStrategy}>
            {items.map((item) => (
              <SortableContentItem
                key={item.contentItemId}
                id={item.contentItemId}
                title={item.title}
                disabled={reorder.isPending}
              >
                {(handle) => renderItem(item, handle)}
              </SortableContentItem>
            ))}
          </SortableContext>
        </DndContext>
      )}
      {reorderError && (
        <div className="border-l px-3 pt-2">
          <Alert type="error" header="Couldn't reorder the content">
            {reorderError}
          </Alert>
        </div>
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
