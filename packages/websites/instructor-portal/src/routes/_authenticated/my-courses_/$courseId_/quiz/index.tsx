/**
 * Copyright Discava Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { createFileRoute, redirect } from '@tanstack/react-router';

// Quizzes live on the course page; this path only exists as a breadcrumb.
export const Route = createFileRoute(
  '/_authenticated/my-courses_/$courseId_/quiz/',
)({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: '/my-courses/$courseId',
      params: { courseId: params.courseId },
    });
  },
});
