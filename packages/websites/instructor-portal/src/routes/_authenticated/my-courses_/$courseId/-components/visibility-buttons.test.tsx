/**
 * Copyright Discava Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  renderWithInstructorApi,
} from '../../../../../test/render-with-instructor-api';
import {
  ContentItemVisibilityButton,
  LessonVisibilityButton,
  ModuleVisibilityButton,
} from './visibility-buttons';

const key = {
  courseId: 'course-1',
  moduleId: 'module-1',
  lessonId: 'lesson-1',
  contentItemId: 'item-1',
};

const confirm = async (
  user: ReturnType<typeof renderWithInstructorApi>['user'],
  name: RegExp,
) =>
  user.click(
    within(screen.getByRole('alertdialog')).getByRole('button', { name }),
  );

describe('ModuleVisibilityButton', () => {
  it('publishes a hidden module, saying everything new in it comes too, then refreshes the course', async () => {
    const { calls, queryClient, optionsProxy, user } = renderWithInstructorApi(
      <ModuleVisibilityButton
        courseId={key.courseId}
        moduleId={key.moduleId}
        title="Module One"
        visibility="hidden"
        draft={false}
      />,
      { handlers: { 'module.publish': () => ({}) } },
    );
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    await user.click(
      screen.getByRole('button', { name: 'Publish module Module One' }),
    );
    expect(screen.getByRole('alertdialog')).toHaveTextContent(
      `Students will see "Module One" straight away, together with the new content in it that hasn't been published yet. Anything you hid after students could see it stays hidden.`,
    );
    await confirm(user, /^Publish module$/);

    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(),
    );
    expect(calls).toEqual([
      {
        path: 'module.publish',
        input: { courseId: key.courseId, moduleId: key.moduleId },
      },
    ]);
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: optionsProxy.course.view.queryKey({ courseId: key.courseId }),
    });
  });

  it('hides a visible module, saying students lose everything in it', async () => {
    const { calls, user } = renderWithInstructorApi(
      <ModuleVisibilityButton
        courseId={key.courseId}
        moduleId={key.moduleId}
        title="Module One"
        visibility="visible"
        draft={false}
      />,
      { handlers: { 'module.hide': () => ({}) } },
    );

    await user.click(
      screen.getByRole('button', { name: 'Hide module Module One' }),
    );
    expect(screen.getByRole('alertdialog')).toHaveTextContent(
      'Students will no longer see "Module One" or anything in it.',
    );
    await confirm(user, /^Hide module$/);

    await waitFor(() =>
      expect(calls).toEqual([
        {
          path: 'module.hide',
          input: { courseId: key.courseId, moduleId: key.moduleId },
        },
      ]),
    );
  });

  it('in a draft course, says the change applies once the course is published', async () => {
    const { user } = renderWithInstructorApi(
      <ModuleVisibilityButton
        courseId={key.courseId}
        moduleId={key.moduleId}
        title="Module One"
        visibility="visible"
        draft
      />,
    );

    await user.click(
      screen.getByRole('button', { name: 'Hide module Module One' }),
    );

    expect(screen.getByRole('alertdialog')).toHaveTextContent(
      '"Module One" and everything in it will stay hidden from students when the course is published',
    );
  });

  it('shows a refusal from the API in the dialog, which stays open, and Cancel closes it', async () => {
    const { user } = renderWithInstructorApi(
      <ModuleVisibilityButton
        courseId={key.courseId}
        moduleId={key.moduleId}
        title="Module One"
        visibility="hidden"
        draft={false}
      />,
      {
        handlers: {
          'module.publish': () => {
            throw new ApiError(
              'PRECONDITION_FAILED',
              'Restore the course first',
            );
          },
        },
      },
    );

    await user.click(
      screen.getByRole('button', { name: 'Publish module Module One' }),
    );
    await confirm(user, /^Publish module$/);

    const dialog = screen.getByRole('alertdialog');
    await waitFor(() =>
      expect(dialog).toHaveTextContent("Couldn't publish the module"),
    );
    expect(dialog).toHaveTextContent('Restore the course first');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});

describe('LessonVisibilityButton', () => {
  it('says a published lesson shows only while its module is visible, and publishes it', async () => {
    const { calls, user } = renderWithInstructorApi(
      <LessonVisibilityButton
        courseId={key.courseId}
        moduleId={key.moduleId}
        lessonId={key.lessonId}
        title="Lesson One"
        visibility="hidden"
        draft={false}
      />,
      { handlers: { 'lesson.publish': () => ({}) } },
    );

    await user.click(
      screen.getByRole('button', { name: 'Publish lesson Lesson One' }),
    );
    expect(screen.getByRole('alertdialog')).toHaveTextContent(
      'Students will see "Lesson One" as long as its module is visible',
    );
    await confirm(user, /^Publish lesson$/);

    await waitFor(() =>
      expect(calls).toEqual([
        {
          path: 'lesson.publish',
          input: {
            courseId: key.courseId,
            moduleId: key.moduleId,
            lessonId: key.lessonId,
          },
        },
      ]),
    );
  });
});

describe('ContentItemVisibilityButton', () => {
  it('says an item shows only while its lesson and module are visible, and publishes it', async () => {
    const { calls, user } = renderWithInstructorApi(
      <ContentItemVisibilityButton
        {...key}
        noun="text"
        title="Intro"
        visibility="hidden"
        draft={false}
      />,
      { handlers: { 'contentItem.publish': () => ({}) } },
    );

    await user.click(
      screen.getByRole('button', { name: 'Publish text Intro' }),
    );
    expect(screen.getByRole('alertdialog')).toHaveTextContent(
      'Students will see "Intro" as long as its lesson and module are visible.',
    );
    await confirm(user, /^Publish text$/);

    await waitFor(() =>
      expect(calls).toEqual([{ path: 'contentItem.publish', input: key }]),
    );
  });

  it('hides a visible item, keeping students’ progress', async () => {
    const { calls, user } = renderWithInstructorApi(
      <ContentItemVisibilityButton
        {...key}
        noun="video"
        title="Intro"
        visibility="visible"
        draft={false}
      />,
      { handlers: { 'contentItem.hide': () => ({}) } },
    );

    await user.click(screen.getByRole('button', { name: 'Hide video Intro' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent(
      'Students will no longer see "Intro". Their progress is kept',
    );
    await confirm(user, /^Hide video$/);

    await waitFor(() =>
      expect(calls).toEqual([{ path: 'contentItem.hide', input: key }]),
    );
  });
});
