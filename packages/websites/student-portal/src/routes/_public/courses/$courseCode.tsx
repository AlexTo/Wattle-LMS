/**
 * Copyright Discava Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { createFileRoute } from '@tanstack/react-router';
import { CoursePreview } from '../../../components/CoursePreview';

export const Route = createFileRoute('/_public/courses/$courseCode')({
  component: RouteComponent,
});

function RouteComponent() {
  const { courseCode } = Route.useParams();
  return (
    <CoursePreview
      courseCode={courseCode}
      backTo="/"
      backLabel="Back to Explore"
    />
  );
}
