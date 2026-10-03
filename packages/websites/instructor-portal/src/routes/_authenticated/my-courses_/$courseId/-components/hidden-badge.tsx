/**
 * Copyright Discava Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { Badge } from '@discava/common-shadcn/components/ui/badge';
import { EyeOff } from 'lucide-react';

// Marks a module, lesson or content item students can't see yet.
export function HiddenBadge() {
  return (
    <Badge
      variant="outline"
      className="gap-1 text-[10px] text-muted-foreground"
      title="Students can't see this until it's published"
    >
      <EyeOff className="size-3" /> Hidden
    </Badge>
  );
}
