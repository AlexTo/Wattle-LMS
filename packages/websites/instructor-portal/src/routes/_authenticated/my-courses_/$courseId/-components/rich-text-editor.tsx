/**
 * Copyright Discava Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Toggle } from '@discava/common-shadcn/components/ui/toggle';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Bold, Heading2, Italic, List, ListOrdered } from 'lucide-react';
import type { ReactNode } from 'react';

const parseContent = (body: string | undefined) => {
  if (!body) {
    return undefined;
  }
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
};

/**
 * A minimal Tiptap-based rich text editor for authoring a text content
 * item's body. Controlled by `value` (Tiptap's JSON document, stringified --
 * see #111), emitting the same shape via `onChange`.
 */
export function RichTextEditor({
  value,
  onChange,
  ariaLabel,
  minHeightClass = 'min-h-32',
}: {
  value: string | undefined;
  onChange: (body: string) => void;
  // What the editing area is called to assistive technology, e.g. "Question 2".
  ariaLabel?: string;
  minHeightClass?: string;
}) {
  const editor = useEditor({
    extensions: [StarterKit],
    content: parseContent(value),
    onUpdate: ({ editor }) => {
      onChange(JSON.stringify(editor.getJSON()));
    },
    editorProps: {
      attributes: {
        class: cn(
          'prose prose-sm dark:prose-invert max-w-none px-3 py-2 focus:outline-none',
          minHeightClass,
        ),
        ...(ariaLabel && { 'aria-label': ariaLabel }),
      },
    },
  });

  return (
    <div className="rounded-lg border">
      <div className="flex flex-wrap items-center gap-1 border-b bg-muted/50 px-2 py-1">
        <ToolbarButton
          label="Bold"
          active={editor?.isActive('bold')}
          onClick={() => editor?.chain().focus().toggleBold().run()}
        >
          <Bold />
        </ToolbarButton>
        <ToolbarButton
          label="Italic"
          active={editor?.isActive('italic')}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
        >
          <Italic />
        </ToolbarButton>
        <ToolbarButton
          label="Heading"
          active={editor?.isActive('heading', { level: 2 })}
          onClick={() =>
            editor?.chain().focus().toggleHeading({ level: 2 }).run()
          }
        >
          <Heading2 />
        </ToolbarButton>
        <ToolbarButton
          label="Bullet list"
          active={editor?.isActive('bulletList')}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
        >
          <List />
        </ToolbarButton>
        <ToolbarButton
          label="Numbered list"
          active={editor?.isActive('orderedList')}
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered />
        </ToolbarButton>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}

function ToolbarButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Toggle
      size="sm"
      aria-label={label}
      pressed={Boolean(active)}
      onPressedChange={onClick}
    >
      {children}
    </Toggle>
  );
}
