/**
 * Copyright Discava Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { t } from './init.js';
import { deleteContentItem } from './procedures/content-item-shared.js';
import {
  createContentItemText,
  updateContentItemText,
} from './procedures/content-item-text.js';
import {
  createContentItemVideo,
  createContentItemVideoUploadUrl,
  createContentItemVideoUrl,
  updateContentItemVideo,
} from './procedures/content-item-video.js';
import { archiveCourse, createCourse } from './procedures/course.js';
import {
  createLesson,
  deleteLesson,
  updateLesson,
} from './procedures/lesson.js';
import {
  createModule,
  deleteModule,
  updateModule,
} from './procedures/module.js';

export const router = t.router;

export const appRouter = router({
  course: router({
    create: createCourse,
    archive: archiveCourse,
  }),
  module: router({
    create: createModule,
    update: updateModule,
    delete: deleteModule,
  }),
  lesson: router({
    create: createLesson,
    update: updateLesson,
    delete: deleteLesson,
  }),
  contentItem: router({
    createVideoUploadUrl: createContentItemVideoUploadUrl,
    createVideo: createContentItemVideo,
    createText: createContentItemText,
    updateVideo: updateContentItemVideo,
    updateText: updateContentItemText,
    createVideoUrl: createContentItemVideoUrl,
    delete: deleteContentItem,
  }),
});

export type AppRouter = typeof appRouter;
