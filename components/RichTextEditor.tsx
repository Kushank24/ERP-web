"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import UnderlineExt from "@tiptap/extension-underline";
import ImageExt from "@tiptap/extension-image";
import LinkExt from "@tiptap/extension-link";
import TextAlign from "@tiptap/extension-text-align";
import Placeholder from "@tiptap/extension-placeholder";
import { useRef, useCallback, useState } from "react";

// ── Toolbar button ────────────────────────────────────────────────────────────

function Btn({
  active,
  onClick,
  title,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      title={title}
      className={`select-none rounded px-2 py-1 text-xs font-medium transition ${
        active
          ? "bg-accent/20 text-accent"
          : "text-slate-400 hover:bg-white/[0.06] hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="mx-0.5 h-4 w-px shrink-0 bg-surface-border" />;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface RichTextEditorProps {
  initialContent?: string;
  onChange?: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
  /** If provided, called with the selected File; must resolve to a public URL. Falls back to base64. */
  uploadImage?: (file: File) => Promise<string>;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function RichTextEditor({
  initialContent = "",
  onChange,
  placeholder = "Write your email body here…",
  minHeight = 280,
  uploadImage,
}: RichTextEditorProps) {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit,
      UnderlineExt,
      ImageExt.configure({ inline: false, allowBase64: true }),
      LinkExt.configure({ openOnClick: false, HTMLAttributes: { rel: "noopener noreferrer" } }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Placeholder.configure({ placeholder }),
    ],
    content: initialContent || "<p></p>",
    onUpdate: ({ editor: e }) => {
      onChange?.(e.getHTML());
    },
    editorProps: {
      attributes: {
        class: "rte-body outline-none",
        style: `min-height:${minHeight}px; padding:1rem`,
      },
    },
    immediatelyRender: false,
  });

  const handleImageFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !editor) return;
      e.target.value = "";

      if (uploadImage) {
        setUploading(true);
        try {
          const url = await uploadImage(file);
          editor.chain().focus().setImage({ src: url }).run();
          onChange?.(editor.getHTML());
        } catch {
          alert("Image upload failed. The image was not inserted.");
        } finally {
          setUploading(false);
        }
      } else {
        // Fallback: base64 inline (may be blocked by some email clients)
        const reader = new FileReader();
        reader.onload = () => {
          editor.chain().focus().setImage({ src: reader.result as string }).run();
          onChange?.(editor.getHTML());
        };
        reader.readAsDataURL(file);
      }
    },
    [editor, onChange, uploadImage]
  );

  const setLink = useCallback(() => {
    if (!editor) return;
    const prev = editor.getAttributes("link").href ?? "";
    const url = window.prompt("Link URL:", prev);
    if (url === null) return;
    if (url.trim() === "") {
      editor.chain().focus().unsetLink().run();
    } else {
      editor.chain().focus().setLink({ href: url.trim() }).run();
    }
    onChange?.(editor.getHTML());
  }, [editor, onChange]);

  if (!editor) return null;

  return (
    <>
      {/*
        Scoped styles for editor content. Colors are read from the app's
        theme tokens (--color-*, defined in globals.css) rather than hardcoded
        hex, so this box repaints when [data-theme="light"] is set instead of
        going invisible. Previously every color here was a fixed hex tuned
        for the dark palette — the .rte-body text stayed light grey while
        light mode's CSS repainted the *container* backgrounds, making the
        text unreadable against its own editing surface.
      */}
      <style>{`
        .rte-body { color: var(--color-text-primary); font-size:14px; line-height:1.7; word-break:break-word; }
        .rte-body p { margin:0 0 .6rem; }
        .rte-body p:last-child { margin-bottom:0; }
        .rte-body h1 { font-size:1.4rem; font-weight:700; color: var(--color-text-primary); margin:0 0 .6rem; }
        .rte-body h2 { font-size:1.15rem; font-weight:600; color: var(--color-text-primary); margin:0 0 .6rem; }
        .rte-body h3 { font-size:1rem; font-weight:600; color: var(--color-text-primary); margin:0 0 .5rem; }
        .rte-body strong { font-weight:700; color: var(--color-text-primary); }
        .rte-body em { font-style:italic; }
        .rte-body u { text-decoration:underline; }
        .rte-body s { text-decoration:line-through; }
        .rte-body a { color: var(--color-accent); text-decoration:underline; }
        .rte-body ul { list-style:disc; padding-left:1.4rem; margin:0 0 .6rem; }
        .rte-body ol { list-style:decimal; padding-left:1.4rem; margin:0 0 .6rem; }
        .rte-body li { margin-bottom:.2rem; }
        .rte-body blockquote { border-left:3px solid var(--color-accent); padding-left:.85rem; color: var(--color-text-secondary); margin:0 0 .6rem; }
        .rte-body img { max-width:100%; height:auto; border-radius:4px; margin:.35rem 0; display:block; }
        .rte-body code { background: var(--color-bg-surface); border-radius:3px; padding:0 .3em; font-family:monospace; font-size:.9em; }
        .rte-body pre { background: var(--color-bg-surface); border-radius:6px; padding:.75rem 1rem; overflow-x:auto; margin:0 0 .6rem; }
        .rte-body pre code { background:none; padding:0; }
        .rte-body p.is-editor-empty:first-child::before { content:attr(data-placeholder); color: var(--color-text-muted); pointer-events:none; float:left; height:0; }
      `}</style>

      <div className="overflow-hidden rounded-lg border border-surface-border" style={{ backgroundColor: "var(--color-bg-base)" }}>
        {/* ── Toolbar ── */}
        <div className="flex flex-wrap items-center gap-0.5 border-b border-surface-border px-2 py-1.5" style={{ backgroundColor: "var(--color-bg-surface)" }}>
          <Btn active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()} title="Bold (⌘B)">
            <strong>B</strong>
          </Btn>
          <Btn active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()} title="Italic (⌘I)">
            <em>I</em>
          </Btn>
          <Btn active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()} title="Underline (⌘U)">
            <u>U</u>
          </Btn>
          <Btn active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()} title="Strikethrough">
            <s>S</s>
          </Btn>

          <Divider />

          <Btn active={editor.isActive("heading", { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} title="Heading 1">
            H1
          </Btn>
          <Btn active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title="Heading 2">
            H2
          </Btn>

          <Divider />

          <Btn active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Bullet list">
            • List
          </Btn>
          <Btn active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Numbered list">
            1. List
          </Btn>

          <Divider />

          <Btn active={editor.isActive({ textAlign: "left" })} onClick={() => editor.chain().focus().setTextAlign("left").run()} title="Align left">
            ≡L
          </Btn>
          <Btn active={editor.isActive({ textAlign: "center" })} onClick={() => editor.chain().focus().setTextAlign("center").run()} title="Center">
            ≡C
          </Btn>
          <Btn active={editor.isActive({ textAlign: "right" })} onClick={() => editor.chain().focus().setTextAlign("right").run()} title="Align right">
            ≡R
          </Btn>

          <Divider />

          <Btn active={editor.isActive("link")} onClick={setLink} title="Insert / edit link">
            Link
          </Btn>
          <Btn active={false} onClick={() => !uploading && imageInputRef.current?.click()} title="Insert image from file">
            {uploading ? "Uploading…" : "Image"}
          </Btn>

          <Divider />

          <Btn active={false} onClick={() => editor.chain().focus().undo().run()} title="Undo (⌘Z)">
            ↩
          </Btn>
          <Btn active={false} onClick={() => editor.chain().focus().redo().run()} title="Redo (⌘⇧Z)">
            ↪
          </Btn>
        </div>

        {/* ── Editor content ── */}
        <EditorContent editor={editor} />

        {/* Hidden image file input */}
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleImageFile}
        />
      </div>
    </>
  );
}
