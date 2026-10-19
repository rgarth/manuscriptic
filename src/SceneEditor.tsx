import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useState, useSyncExternalStore, type CSSProperties } from "react";
import {
  alignments,
  defaultFont,
  fontFamily,
  getEditorPrefs,
  setAlignment,
  displayPixels,
  setEditorFont,
  setPointSize,
  subscribeEditorPrefs,
  type Alignment,
} from "./editorPrefs";
import { registerCommands } from "./commands";
import Hint from "./Hint.tsx";
import { formatCommands, formatCommandsIn } from "./formatCommands";
import Icon, { type IconName } from "./icons";
import { includesWord } from "./dictionary.ts";
import { parseEditorDoc, type EditorDoc } from "./model/editorDoc";
import { dictionarySpellcheckKey, projectDictionary, wordFromPoint } from "./spellcheck";
import { listFonts } from "./storage";

type SceneEditorProps = {
  title: string;
  content: EditorDoc;
  dictionary: string[];
  onTitle: (title: string) => void;
  onContent: (content: EditorDoc) => void;
  onAddWord: (word: string) => void;
  onRemoveWord: (word: string) => void;
};

type WordMenu = {
  x: number;
  y: number;
  word: string;
};

const extensions = [
  StarterKit.configure({
    heading: false,
    code: false,
    codeBlock: false,
    blockquote: false,
    horizontalRule: false,
    link: false,
  }),
  Superscript,
  Subscript,
  projectDictionary,
];

export default function SceneEditor({
  title,
  content,
  dictionary,
  onTitle,
  onContent,
  onAddWord,
  onRemoveWord,
}: SceneEditorProps) {
  const [wordMenu, setWordMenu] = useState<WordMenu | null>(null);
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
          const word = wordFromPoint(view, event.clientX, event.clientY);
          if (!word) {
            return false;
          }
          event.preventDefault();
          setWordMenu({
            x: Math.min(event.clientX, window.innerWidth - 240),
            y: Math.min(event.clientY, window.innerHeight - 48),
            word,
          });
          return true;
        },
      },
    },
    onUpdate: ({ editor: current }) => {
      const parsed = parseEditorDoc(current.getJSON());
      if (parsed) {
        onContent(parsed);
      }
    },
  });
  const prefs = useSyncExternalStore(subscribeEditorPrefs, getEditorPrefs, getEditorPrefs);
  const [fonts, setFonts] = useState<string[]>([defaultFont]);
  const pageStyle = {
    "--editor-font": fontFamily(prefs.font),
    "--editor-size": String(displayPixels(prefs.points, prefs.zoom)),
    "--editor-align": prefs.align,
  } as CSSProperties;
  const fontOptions = fonts.includes(prefs.font) ? fonts : [prefs.font, ...fonts];

  useEffect(() => {
    void listFonts()
      .then((names) => {
        const available = new Set([defaultFont, ...names]);
        setFonts([...available].sort((a, b) => a.localeCompare(b)));
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!editor) {
      return;
    }
    editor.view.dispatch(editor.state.tr.setMeta(dictionarySpellcheckKey, dictionary));
  }, [editor, dictionary]);

  useEffect(() => {
    if (!editor) {
      return;
    }
    return registerCommands({
      format: (command) => {
        formatCommands[command].apply(editor.chain().focus());
      },
    });
  }, [editor]);

  return (
    <div className="page" style={pageStyle}>
      <div className="page-head">
        <input
          className="scene-title"
          aria-label="Scene title"
          value={title}
          onChange={(event) => onTitle(event.currentTarget.value)}
        />
        <div className="marks">
          <Hint label="Typeface">
            <select
              className="font-choice"
              aria-label="Typeface"
              value={prefs.font}
              onChange={(event) => setEditorFont(event.currentTarget.value)}
            >
              {fontOptions.map((name) => (
                <option key={name} value={name} style={{ fontFamily: fontFamily(name) }}>
                  {name}
                </option>
              ))}
            </select>
          </Hint>
          <Hint label="Point size">
            <input
              className="size-choice"
              aria-label="Point size"
              type="number"
              min={8}
              max={72}
              value={prefs.points}
              onChange={(event) => setPointSize(event.currentTarget.value)}
            />
          </Hint>
          <span className="size-unit">pt</span>
          <span className="mark-gap" />
          {alignments.map((item) => (
            <Hint key={item.id} label={item.label}>
              <button
                type="button"
                className="mark"
                aria-label={item.label}
                aria-pressed={prefs.align === item.id}
                onClick={() => setAlignment(item.id)}
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
      <EditorContent className="editor-surface" editor={editor} />
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
          onClose={() => setWordMenu(null)}
        />
      ) : null}
    </div>
  );
}

function WordMenuPop({
  menu,
  known,
  onAdd,
  onRemove,
  onClose,
}: {
  menu: WordMenu;
  known: boolean;
  onAdd: () => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  return (
    <>
      <button type="button" className="menu-dismiss" aria-label="Close menu" onClick={onClose} />
      <div className="context-menu" style={{ left: menu.x, top: menu.y }} role="menu">
        {known ? (
          <button type="button" role="menuitem" onClick={onRemove}>
            Remove “{menu.word}” from this project
          </button>
        ) : (
          <button type="button" role="menuitem" onClick={onAdd}>
            Add “{menu.word}” to this project
          </button>
        )}
      </div>
    </>
  );
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
