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
import { formatCommands, formatCommandsIn } from "./formatCommands";
import Icon, { type IconName } from "./icons";
import { parseEditorDoc, type EditorDoc } from "./model/editorDoc";
import { listFonts } from "./storage";

type SceneEditorProps = {
  title: string;
  content: EditorDoc;
  onTitle: (title: string) => void;
  onContent: (content: EditorDoc) => void;
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
];

export default function SceneEditor({
  title,
  content,
  onTitle,
  onContent,
}: SceneEditorProps) {
  const editor = useEditor({
    extensions,
    content,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        spellcheck: "true",
        "aria-label": "Scene text",
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
          <input
            className="size-choice"
            aria-label="Point size"
            type="number"
            min={8}
            max={72}
            value={prefs.points}
            onChange={(event) => setPointSize(event.currentTarget.value)}
          />
          <span className="size-unit">pt</span>
          <span className="mark-gap" />
          {alignments.map((item) => (
            <button
              key={item.id}
              type="button"
              className="mark"
              aria-label={item.label}
              aria-pressed={prefs.align === item.id}
              onClick={() => setAlignment(item.id)}
            >
              <Icon name={alignmentIcon(item.id)} />
            </button>
          ))}
          <span className="mark-gap" />
          {formatMarks(editor, "character")}
          <span className="mark-gap" />
          {formatMarks(editor, "list")}
        </div>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}

function formatMarks(editor: Editor | null, group: "character" | "list") {
  return formatCommandsIn(group).map(([command, spec]) => (
    <button
      key={command}
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
