import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { sql, SQLite } from '@codemirror/lang-sql';
import {
  bracketMatching,
  defaultHighlightStyle,
  indentOnInput,
  syntaxHighlighting,
} from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, placeholder as placeholderExt } from '@codemirror/view';
import * as React from 'react';

import { type EditorLanguage, LANGUAGE_MODES } from '@/lib/editor-language';

export interface CodeEditorHandle {
  focus: () => void;
}

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  language: EditorLanguage;
  placeholder: string;
  /** Cmd/Ctrl+Enter, matching the textarea it replaces. */
  onSubmit: () => void;
  minHeight: string;
  /** Read-only files in a workout workspace: openable, never writable. */
  readOnly?: boolean;
}

/**
 * CodeMirror 6 wrapped for the answer box. Hand-written rather than pulled from a
 * React binding, for the same reason the shadcn components are: one file we own,
 * no wrapper to keep in step. Everything ships in the bundle, so it works offline.
 */
export const CodeEditor = React.forwardRef<CodeEditorHandle, CodeEditorProps>(function CodeEditor(
  { value, onChange, language, placeholder, onSubmit, minHeight, readOnly = false },
  ref
) {
  const host = React.useRef<HTMLDivElement>(null);
  const view = React.useRef<EditorView | null>(null);

  // Callbacks live in a ref so changing them never tears down the editor.
  const handlers = React.useRef({ onChange, onSubmit });
  handlers.current = { onChange, onSubmit };

  React.useImperativeHandle(ref, () => ({
    focus: () => view.current?.focus(),
  }));

  React.useEffect(() => {
    if (!host.current) return;

    const state = EditorState.create({
      doc: value,
      extensions: [
        history(),
        EditorState.readOnly.of(readOnly),
        EditorView.editable.of(!readOnly),
        bracketMatching(),
        indentOnInput(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        placeholderExt(placeholder),
        EditorView.lineWrapping,
        language === 'sql'
          ? sql({ dialect: SQLite, upperCaseKeywords: true })
          : LANGUAGE_MODES[language](),
        keymap.of([
          {
            key: 'Mod-Enter',
            run: () => {
              handlers.current.onSubmit();
              return true;
            },
          },
          indentWithTab,
          ...defaultKeymap,
          ...historyKeymap,
        ]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) handlers.current.onChange(update.state.doc.toString());
        }),
        EditorView.theme({
          '&': { fontSize: '0.875rem', minHeight },
          '&.cm-focused': { outline: 'none' },
          '.cm-content': {
            fontFamily: 'var(--font-mono)',
            padding: '0.5rem 0',
            caretColor: 'var(--foreground)',
          },
          '.cm-line': { padding: '0 0.75rem' },
          '.cm-scroller': { lineHeight: '1.6' },
          '.cm-placeholder': { color: 'var(--muted-foreground)' },
          '.cm-activeLine': { backgroundColor: 'transparent' },
        }),
      ],
    });

    const editor = new EditorView({ state, parent: host.current });
    view.current = editor;
    return () => {
      editor.destroy();
      view.current = null;
    };
    // The editor is created once per problem; `value` seeds it and is synced below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language, placeholder, minHeight, readOnly]);

  // Push external changes in (starter code arriving, answer cleared on navigation)
  // without clobbering what is being typed.
  React.useEffect(() => {
    const editor = view.current;
    if (!editor) return;
    const current = editor.state.doc.toString();
    if (current === value) return;
    editor.dispatch({ changes: { from: 0, to: current.length, insert: value } });
  }, [value]);

  return (
    <div
      ref={host}
      className="w-full overflow-hidden rounded-md border bg-card shadow-sm focus-within:ring-1 focus-within:ring-ring"
    />
  );
});
