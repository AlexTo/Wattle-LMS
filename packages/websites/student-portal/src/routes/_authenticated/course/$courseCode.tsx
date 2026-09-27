/**
 * Copyright Discava Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { createFileRoute } from '@tanstack/react-router';
import { CourseContent } from '../../../components/CourseContent';

export const Route = createFileRoute('/_authenticated/course/$courseCode')({
  component: RouteComponent,
});

function RouteComponent() {
  const { courseCode } = Route.useParams();
  return <CourseContent courseCode={courseCode} />;
}
