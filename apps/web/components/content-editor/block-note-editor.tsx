"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/shadcn";
import { BlockNoteSchema, defaultBlockSpecs } from "@blocknote/core";
import "@blocknote/shadcn/style.css";
import { useTheme } from "@/components/theme-provider";
import type { BodyDocument } from "@nnact/shared";
import { NNACT_BLOCK_SPECS } from "./nnact-blocks";

export interface BlockNoteEditorHandle {
  getDocument: () => BodyDocument;
  getWordCount: () => number;
  getCharCount: () => number;
}

interface Props {
  initialDocument?: BodyDocument | null;
  onChange?: (doc: BodyDocument) => void;
  editable?: boolean;
  placeholder?: string;
}

function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

function flattenText(content: unknown): string {
  if (content == null) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part === "string" ? part : part?.text ?? ""))
      .join("");
  }
  return "";
}

function wordsFromDoc(doc: BodyDocument): number {
  let words = 0;
  for (const block of doc ?? []) {
    words += countWords(flattenText(block.content));
    if (Array.isArray(block.children)) {
      words += wordsFromDoc(block.children as BodyDocument);
    }
  }
  return words;
}

function charsFromDoc(doc: BodyDocument): number {
  let chars = 0;
  for (const block of doc ?? []) {
    chars += flattenText(block.content).length;
    if (Array.isArray(block.children)) {
      chars += charsFromDoc(block.children as BodyDocument);
    }
  }
  return chars;
}

function readingMinutes(words: number): number {
  return Math.max(1, Math.ceil(words / 200));
}

/**
 * Serialize a BlockNote editor document into our canonical BodyDocument shape.
 * The editor.document output is already a plain JSON tree; we just need to
 * strip any undefined values and ensure it's a clean array.
 */
function serializeDocument(raw: unknown): BodyDocument {
  if (!Array.isArray(raw)) return [];
  return JSON.parse(JSON.stringify(raw));
}

export function BlockNoteEditorComponent({
  initialDocument,
  onChange,
  editable = true,
}: Props) {
  const { theme } = useTheme();
  const [wordCount, setWordCount] = useState(0);
  const [charCount, setCharCount] = useState(0);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const schema = useMemo(
    () =>
      BlockNoteSchema.create({
        blockSpecs: {
          ...defaultBlockSpecs,
          ...NNACT_BLOCK_SPECS,
        },
      }),
    [],
  );

  const initialBlocks = (initialDocument ?? []).length
    ? initialDocument
    : undefined;

  const editor = useCreateBlockNote(
    {
      schema,
      initialContent: (initialBlocks as any) ?? undefined,
    },
    [schema],
  );

  const handleChange = useCallback(() => {
    const doc = serializeDocument(editor.document);
    setWordCount(wordsFromDoc(doc));
    setCharCount(charsFromDoc(doc));
    onChangeRef.current?.(doc);
  }, [editor]);

  useEffect(() => {
    const doc = serializeDocument(editor.document);
    setWordCount(wordsFromDoc(doc));
    setCharCount(charsFromDoc(doc));
  }, [editor]);

  return (
    <div className="blocknote-editor-wrapper">
      <BlockNoteView
        editor={editor}
        theme={theme}
        editable={editable}
        onChange={handleChange}
        className="min-h-[400px]"
      />
      <div className="flex items-center gap-4 border-t border-border px-3 py-2 text-xs text-fg-muted">
        <span>{wordCount.toLocaleString()}</span>
        <span>{wordCount === 1 ? "word" : "words"}</span>
        <span className="opacity-50">·</span>
        <span>{charCount.toLocaleString()} chars</span>
        <span className="opacity-50">·</span>
        <span>{readingMinutes(wordCount)} min read</span>
      </div>
    </div>
  );
}
