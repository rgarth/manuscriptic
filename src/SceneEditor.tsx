import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { parseEditorDoc, type EditorDoc } from "./model/project";

type SceneEditorProps = {
  title: string;
  content: EditorDoc;
  onTitle: (title: string) => void;
  onContent: (content: EditorDoc) => void;
};

const extensions = [
  StarterKit.configure({
    heading: false,
    bulletList: false,
    orderedList: false,
    listItem: false,
    code: false,
    codeBlock: false,
    blockquote: false,
    horizontalRule: false,
    hardBreak: false,
    link: false,
    listKeymap: false,
    strike: false,
    underline: false,
  }),
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

  return (
    <div className="page">
      <input
        className="scene-title"
        aria-label="Scene title"
        value={title}
        onChange={(event) => onTitle(event.currentTarget.value)}
      />
      <div className="marks">
        <button
          type="button"
          aria-pressed={editor?.isActive("bold") ?? false}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => editor?.chain().focus().toggleBold().run()}
        >
          Bold
        </button>
        <button
          type="button"
          aria-pressed={editor?.isActive("italic") ?? false}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
        >
          Italic
        </button>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
