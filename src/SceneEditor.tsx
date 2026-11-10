import { TextSelection } from "@tiptap/pm/state";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import { applyParagraphAlign, documentExtensions, shownParagraphAlign } from "./editorExtensions";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { clearFindHighlights, paintFindHighlights, type FindEditorState } from "./findView.ts";
import { getEditorPrefs, indentEm, paragraphGap, spacingLine, subscribeEditorPrefs } from "./editorPrefs";
import { scrollTopForCaret } from "./typewriter";
import {
  alignments,
  displayPixels,
  fontName,
  fontSizePoints,
  fontSizeText,
  pointScale,
  pointSize,
  type Alignment,
  type PageLayout,
} from "./pageLayout";
import { displayFontFamily } from "./bookFonts.ts";
import { registerCommands } from "./commands";
import Hint from "./Hint.tsx";
import { formatCommands, formatCommandsIn } from "./formatCommands";
import Icon, { type IconName } from "./icons";
import { includesWord } from "./dictionary.ts";
import { parseEditorDoc, type EditorDoc } from "./model/editorDoc";
import { marksInside } from "./find";
import { dictionarySpellcheckKey, isMisspelled, projectDictionary, suggestionCase, wordFromPoint } from "./spellcheck";
import { reportFailure } from "./failures";
import { spellingSuggestions } from "./storage";
import { FontChoice, useAvailableFonts } from "./FontChoice.tsx";

type SceneEditorProps = {
  title: string;
  content: EditorDoc;
  dictionary: string[];
  layout: PageLayout;
  onTitle: (title: string) => void;
  onContent: (content: EditorDoc) => void;
  onAddWord: (word: string) => void;
  onRemoveWord: (word: string) => void;
  hint?: string | null;
  manuscript?: boolean;
  find: FindEditorState;
};

type WordMenu = {
  x: number;
  y: number;
  word: string;
  from: number;
  to: number;
  suggestions: string[];
};

const extensions = [...documentExtensions, projectDictionary];

export default function SceneEditor({
  title,
  content,
  dictionary,
  layout,
  onTitle,
  onContent,
  onAddWord,
  onRemoveWord,
  hint = null,
  manuscript = false,
  find,
}: SceneEditorProps) {
  const [wordMenu, setWordMenu] = useState<WordMenu | null>(null);
  const published = useRef<EditorDoc | null>(null);
  const editor = useEditor({
    extensions,
    content,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        spellcheck: "true",
        "aria-label": "Scene text",
      },
      handleDOMEvents: {
        contextmenu(view, event) {
          const found = wordFromPoint(view, event.clientX, event.clientY);
          if (!found) {
            return false;
          }
          event.preventDefault();
          const misspelled = isMisspelled(view, found.from, found.to);
          setWordMenu({
            x: event.clientX,
            y: event.clientY,
            word: found.word,
            from: found.from,
            to: found.to,
            suggestions: [],
          });
          if (misspelled) {
            void spellingSuggestions(found.word)
              .then((suggestions) => {
                setWordMenu((current) => {
                  if (!current || current.from !== found.from || current.to !== found.to) {
                    return current;
                  }
                  return { ...current, suggestions };
                });
              })
              .catch((error: unknown) => {
                reportFailure(error, "Spelling suggestions could not be loaded.");
              });
          }
          return true;
        },
      },
    },
    onUpdate: ({ editor: current }) => {
      clearFindHighlights();
      const parsed = parseEditorDoc(current.getJSON());
      if (!parsed) {
        reportFailure("This scene could not be recorded.", "This scene could not be recorded.");
        return;
      }
      published.current = parsed;
      onContent(parsed);
    },
  });
  useLayoutEffect(() => {
    if (!editor || editor.isDestroyed || content === published.current) {
      return;
    }
    published.current = content;
    const current = parseEditorDoc(editor.getJSON());
    if (current && JSON.stringify(current) === JSON.stringify(content)) {
      return;
    }
    editor.commands.setContent(content, { emitUpdate: false });
  }, [editor, content]);
  useLayoutEffect(() => {
    if (!editor || editor.isDestroyed) {
      return;
    }
    paintFindHighlights(editor.view, find.hits, find.from, find.to);
    return () => clearFindHighlights();
  }, [editor, find.from, find.to, find.hits]);
  const revealed = useRef(0);
  useLayoutEffect(() => {
    if (!editor || editor.isDestroyed || find.reveal === 0 || find.reveal === revealed.current) {
      return;
    }
    revealed.current = find.reveal;
    if (find.from === null || find.to === null || find.from >= find.to || find.to > editor.state.doc.content.size) {
      return;
    }
    const inFindBar =
      document.activeElement instanceof HTMLElement && document.activeElement.closest(".find-bar") !== null;
    if (inFindBar) {
      scrollMatchIntoView(editor, find.from);
      return;
    }
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, find.from, find.to)).scrollIntoView(),
    );
  }, [editor, find.reveal, find.from, find.to]);
  const zoom = useSyncExternalStore(subscribeEditorPrefs, readZoom, readZoom);
  const typewriter = useSyncExternalStore(subscribeEditorPrefs, readTypewriter, readTypewriter);
  const indent = useSyncExternalStore(subscribeEditorPrefs, readIndent, readIndent);
  const spacing = useSyncExternalStore(subscribeEditorPrefs, readSpacing, readSpacing);
  const shape = manuscript ? indent : "none";
  const pageStyle = {
    "--editor-font": displayFontFamily(layout.font),
    "--editor-size": String(displayPixels(layout.points, zoom)),
    "--editor-pt": String(pointScale(zoom)),
    "--editor-align": layout.align,
    "--editor-indent": indentEm(shape),
    "--editor-spacing": spacingLine(spacing),
    "--editor-gap": paragraphGap(shape),
  } as CSSProperties;
  useEffect(() => {
    if (!editor) {
      return;
    }
    editor.view.dispatch(editor.state.tr.setMeta(dictionarySpellcheckKey, dictionary));
  }, [editor, dictionary]);

  useEffect(() => {
    if (!editor || !typewriter) {
      return;
    }
    let frame = 0;
    const center = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => centerCaret(editor));
    };
    editor.on("selectionUpdate", center);
    editor.on("focus", center);
    center();
    return () => {
      cancelAnimationFrame(frame);
      editor.off("selectionUpdate", center);
      editor.off("focus", center);
    };
  }, [editor, typewriter]);

  const paragraphAlign = useParagraphAlign(editor, layout.align);
  useEffect(() => {
    if (!editor) {
      return;
    }
    return registerCommands({
      format: (command) => {
        formatCommands[command].apply(editor.chain().focus());
      },
      undo: () => {
        editor.chain().focus().undo().run();
      },
      redo: () => {
        editor.chain().focus().redo().run();
      },
      align: paragraphAlign,
      applyAlign: (align) => {
        applyParagraphAlign(editor, align, layout.align);
      },
    });
  }, [editor, paragraphAlign, layout.align]);

  return (
    <div className={typewriter ? "page typewriter" : "page"} style={pageStyle}>
      <div className="page-head">
        <input
          className="scene-title"
          aria-label="Scene title"
          value={title}
          onChange={(event) => onTitle(event.currentTarget.value)}
        />
        {hint ? <p className="page-hint">{hint}</p> : null}
        <div className="marks">
          <CharacterFace editor={editor} layout={layout} />
          <span className="mark-gap" />
          {alignments.map((item) => (
            <Hint key={item.id} label={item.label}>
              <button
                type="button"
                className="mark"
                aria-label={item.label}
                aria-pressed={paragraphAlign === item.id}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  if (editor) {
                    applyParagraphAlign(editor, item.id, layout.align);
                  }
                }}
              >
                <Icon name={alignmentIcon(item.id)} />
              </button>
            </Hint>
          ))}
          <span className="mark-gap" />
          {formatMarks(editor, "character")}
          <span className="mark-gap" />
          {formatMarks(editor, "list")}
        </div>
      </div>
      <div className="editor-scroll">
        <EditorContent className="editor-surface" editor={editor} />
      </div>
      {wordMenu ? (
        <WordMenuPop
          menu={wordMenu}
          known={includesWord(dictionary, wordMenu.word)}
          onAdd={() => {
            onAddWord(wordMenu.word);
            setWordMenu(null);
          }}
          onRemove={() => {
            onRemoveWord(wordMenu.word);
            setWordMenu(null);
          }}
          onReplace={(suggestion) => {
            replaceWord(editor, wordMenu.from, wordMenu.to, wordMenu.word, suggestion);
            setWordMenu(null);
          }}
          onClose={() => setWordMenu(null)}
        />
      ) : null}
    </div>
  );
}

function readZoom(): number {
  return getEditorPrefs().zoom;
}

function readTypewriter(): boolean {
  return getEditorPrefs().typewriter;
}

function readIndent() {
  return getEditorPrefs().indent;
}

function readSpacing() {
  return getEditorPrefs().spacing;
}

function scrollMatchIntoView(editor: Editor, pos: number) {
  const scroll = editor.view.dom.closest(".editor-scroll");
  if (!(scroll instanceof HTMLElement)) {
    return;
  }
  let coords: { top: number; bottom: number };
  try {
    coords = editor.view.coordsAtPos(pos);
  } catch {
    return;
  }
  const box = scroll.getBoundingClientRect();
  if (coords.top >= box.top + 24 && coords.bottom <= box.bottom - 24) {
    return;
  }
  scroll.scrollTop = scrollTopForCaret(scroll.scrollTop, (coords.top + coords.bottom) / 2, box.top, box.height);
}

function centerCaret(editor: Editor) {
  if (editor.isDestroyed || !editor.view.hasFocus()) {
    return;
  }
  const scroll = editor.view.dom.closest(".editor-scroll");
  if (!(scroll instanceof HTMLElement)) {
    return;
  }
  let coords: { top: number; bottom: number };
  try {
    coords = editor.view.coordsAtPos(editor.state.selection.head);
  } catch {
    return;
  }
  const box = scroll.getBoundingClientRect();
  const next = scrollTopForCaret(scroll.scrollTop, (coords.top + coords.bottom) / 2, box.top, box.height);
  if (Math.abs(next - scroll.scrollTop) < 1) {
    return;
  }
  scroll.scrollTop = next;
}

function replaceWord(editor: Editor | null, from: number, to: number, word: string, suggestion: string) {
  if (!editor || editor.isDestroyed || to > editor.state.doc.content.size || from >= to) {
    return;
  }
  if (editor.state.doc.textBetween(from, to) !== word) {
    return;
  }
  const text = suggestionCase(suggestion, word);
  editor.view.dispatch(
    editor.state.tr.replaceWith(from, to, editor.schema.text(text, marksInside(editor.state.doc, from))),
  );
}

function WordMenuPop({
  menu,
  known,
  onAdd,
  onRemove,
  onReplace,
  onClose,
}: {
  menu: WordMenu;
  known: boolean;
  onAdd: () => void;
  onRemove: () => void;
  onReplace: (suggestion: string) => void;
  onClose: () => void;
}) {
  const suggestions = [...new Set(menu.suggestions.map((suggestion) => suggestionCase(suggestion, menu.word)))];
  const label = known ? `Remove “${menu.word}” from this project` : `Add “${menu.word}” to this project`;
  const panel = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const node = panel.current;
    if (!node) {
      return;
    }
    const rect = node.getBoundingClientRect();
    const margin = 8;
    const left = Math.min(Math.max(margin, menu.x), Math.max(margin, window.innerWidth - rect.width - margin));
    const top =
      menu.y + rect.height <= window.innerHeight - margin ? menu.y : Math.max(margin, menu.y - rect.height);
    node.style.left = `${left}px`;
    node.style.top = `${top}px`;
  }, [menu.x, menu.y, suggestions.length, label]);
  return (
    <>
      <button type="button" className="menu-dismiss" aria-label="Close menu" onClick={onClose} />
      <div ref={panel} className="context-menu" style={{ left: menu.x, top: menu.y }} role="menu">
        {suggestions.map((suggestion) => (
          <button type="button" role="menuitem" key={suggestion} onClick={() => onReplace(suggestion)}>
            {suggestion}
          </button>
        ))}
        <button
          type="button"
          role="menuitem"
          className={suggestions.length > 0 ? "menu-split" : undefined}
          onClick={known ? onRemove : onAdd}
        >
          {label}
        </button>
      </div>
    </>
  );
}

function CharacterFace({ editor, layout }: { editor: Editor | null; layout: PageLayout }) {
  const range = useRef<{ from: number; to: number } | null>(null);
  const fonts = useAvailableFonts();
  const face = useCharacterFace(editor);
  const font = face.font ?? layout.font;
  const points = face.points ?? layout.points;
  function remember() {
    if (!editor) {
      return;
    }
    range.current = { from: editor.state.selection.from, to: editor.state.selection.to };
  }
  function chain() {
    if (!editor) {
      return null;
    }
    const saved = range.current;
    const next = editor.chain().focus();
    return saved ? next.setTextSelection(saved) : next;
  }
  return (
    <span className="character-face" onMouseDownCapture={remember}>
      <Hint label="Typeface">
        <FontChoice
          className="font-choice"
          ariaLabel="Typeface"
          fonts={fonts}
          value={font}
          onChange={(next) => {
            const commands = chain();
            if (!commands) {
              return;
            }
            const name = fontName(next);
            if (name === layout.font) {
              commands.unsetFontFamily().run();
              return;
            }
            commands.setFontFamily(name).run();
          }}
        />
      </Hint>
      <Hint label="Point size">
        <input
          className="size-choice"
          aria-label="Point size"
          type="number"
          min={8}
          max={72}
          value={points}
          onChange={(event) => {
            const commands = chain();
            if (!commands) {
              return;
            }
            const size = pointSize(event.currentTarget.value);
            if (size === layout.points) {
              commands.unsetFontSize().run();
              return;
            }
            commands.setFontSize(fontSizeText(size)).run();
          }}
        />
      </Hint>
      <span className="size-unit">pt</span>
    </span>
  );
}

function useParagraphAlign(editor: Editor | null, inherited: Alignment): Alignment {
  const [align, setAlign] = useState(inherited);
  useEffect(() => {
    if (!editor) {
      setAlign(inherited);
      return;
    }
    const read = () => {
      const next = shownParagraphAlign(editor, inherited);
      setAlign((current) => (current === next ? current : next));
    };
    read();
    editor.on("transaction", read);
    return () => {
      editor.off("transaction", read);
    };
  }, [editor, inherited]);
  return align;
}

function useCharacterFace(editor: Editor | null): { font: string | null; points: number | null } {
  const [face, setFace] = useState<{ font: string | null; points: number | null }>({ font: null, points: null });
  useEffect(() => {
    if (!editor) {
      return;
    }
    const read = () => {
      const attrs = editor.getAttributes("textStyle");
      const font = typeof attrs.fontFamily === "string" ? attrs.fontFamily : null;
      const size = fontSizePoints(typeof attrs.fontSize === "string" ? attrs.fontSize : null);
      setFace((current) => (current.font === font && current.points === size ? current : { font, points: size }));
    };
    read();
    editor.on("transaction", read);
    return () => {
      editor.off("transaction", read);
    };
  }, [editor]);
  return face;
}

function formatMarks(editor: Editor | null, group: "character" | "list") {
  return formatCommandsIn(group).map(([command, spec]) => (
    <Hint key={command} label={spec.label}>
      <button
        type="button"
        className="mark"
        aria-label={spec.label}
        aria-pressed={spec.active ? (editor?.isActive(spec.active) ?? false) : undefined}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          if (editor) {
            formatCommands[command].apply(editor.chain().focus());
          }
        }}
      >
        <Icon name={spec.icon} />
      </button>
    </Hint>
  ));
}

function alignmentIcon(id: Alignment): IconName {
  switch (id) {
    case "left":
      return "alignLeft";
    case "center":
      return "alignCenter";
    case "right":
      return "alignRight";
    case "justify":
      return "alignJustify";
    default: {
      const unexpected: never = id;
      return unexpected;
    }
  }
}
