export type Mark =
  | { type: "bold" }
  | { type: "italic" }
  | { type: "underline" }
  | { type: "strike" }
  | { type: "superscript" }
  | { type: "subscript" };

export type TextRun = {
  type: "text";
  text: string;
  marks?: Mark[];
};

export type HardBreak = {
  type: "hardBreak";
};

export type Inline = TextRun | HardBreak;

export type Paragraph = {
  type: "paragraph";
  content?: Inline[];
};

export type ListItem = {
  type: "listItem";
  content: EditorBlock[];
};

export type BulletList = {
  type: "bulletList";
  content: ListItem[];
};

export type OrderedList = {
  type: "orderedList";
  attrs?: { start: number };
  content: ListItem[];
};

export type EditorBlock = Paragraph | BulletList | OrderedList;

export type EditorDoc = {
  type: "doc";
  content: EditorBlock[];
};

export function emptyDoc(): EditorDoc {
  return { type: "doc", content: [{ type: "paragraph" }] };
}

export function wordCount(doc: EditorDoc): number {
  const text = docText(doc).trim();
  if (!text) {
    return 0;
  }
  return text.split(/\s+/).length;
}

export function parseEditorDoc(value: unknown): EditorDoc | null {
  if (!isRecord(value) || value.type !== "doc") {
    return null;
  }
  if (value.content === undefined) {
    return { type: "doc", content: [] };
  }
  if (!Array.isArray(value.content)) {
    return null;
  }
  const content: EditorBlock[] = [];
  for (const block of value.content) {
    const parsed = parseBlock(block);
    if (!parsed) {
      return null;
    }
    content.push(parsed);
  }
  return { type: "doc", content };
}

function docText(doc: EditorDoc): string {
  return doc.content.map((block) => blockText(block)).join("\n");
}

function blockText(block: EditorBlock): string {
  switch (block.type) {
    case "paragraph":
      return (block.content ?? []).map((inline) => inlineText(inline)).join("");
    case "bulletList":
    case "orderedList":
      return block.content
        .map((item) => item.content.map((child) => blockText(child)).join("\n"))
        .join("\n");
    default: {
      const unexpected: never = block;
      return unexpected;
    }
  }
}

function inlineText(inline: Inline): string {
  switch (inline.type) {
    case "text":
      return inline.text;
    case "hardBreak":
      return "\n";
    default: {
      const unexpected: never = inline;
      return unexpected;
    }
  }
}

function parseBlock(value: unknown): EditorBlock | null {
  if (!isRecord(value)) {
    return null;
  }
  switch (value.type) {
    case "paragraph":
      return parseParagraph(value);
    case "bulletList":
    case "orderedList":
      return parseItemList(value);
    default:
      return null;
  }
}

function parseItemList(value: Record<string, unknown>): BulletList | OrderedList | null {
  if ((value.type !== "bulletList" && value.type !== "orderedList") || !Array.isArray(value.content)) {
    return null;
  }
  const content: ListItem[] = [];
  for (const child of value.content) {
    const item = parseListItem(child);
    if (!item) {
      return null;
    }
    content.push(item);
  }
  if (value.type === "bulletList") {
    return { type: "bulletList", content };
  }
  const start = listStart(value.attrs);
  return start === undefined
    ? { type: "orderedList", content }
    : { type: "orderedList", attrs: { start }, content };
}

function listStart(attrs: unknown): number | undefined {
  if (!isRecord(attrs) || attrs.start === undefined || attrs.start === 1) {
    return undefined;
  }
  const start = typeof attrs.start === "number" ? attrs.start : Number.NaN;
  if (!Number.isInteger(start) || start < 1) {
    return undefined;
  }
  return start;
}

function parseListItem(value: unknown): ListItem | null {
  if (!isRecord(value) || value.type !== "listItem" || !Array.isArray(value.content)) {
    return null;
  }
  const content: EditorBlock[] = [];
  for (const child of value.content) {
    const block = parseBlock(child);
    if (!block) {
      return null;
    }
    content.push(block);
  }
  return { type: "listItem", content };
}

function parseParagraph(value: unknown): Paragraph | null {
  if (!isRecord(value) || value.type !== "paragraph") {
    return null;
  }
  if (value.content === undefined) {
    return { type: "paragraph" };
  }
  if (!Array.isArray(value.content)) {
    return null;
  }
  const content: Inline[] = [];
  for (const child of value.content) {
    const inline = parseInline(child);
    if (!inline) {
      return null;
    }
    content.push(inline);
  }
  return { type: "paragraph", content };
}

function parseInline(value: unknown): Inline | null {
  if (!isRecord(value)) {
    return null;
  }
  switch (value.type) {
    case "text":
      return parseTextRun(value);
    case "hardBreak":
      return { type: "hardBreak" };
    default:
      return null;
  }
}

function parseTextRun(value: unknown): TextRun | null {
  if (!isRecord(value) || value.type !== "text" || typeof value.text !== "string") {
    return null;
  }
  const marks = parseMarks(value.marks);
  if (!marks) {
    return null;
  }
  if (marks.length === 0) {
    return { type: "text", text: value.text };
  }
  return { type: "text", text: value.text, marks };
}

function parseMarks(value: unknown): Mark[] | null {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    return null;
  }
  const marks: Mark[] = [];
  for (const mark of value) {
    if (!isRecord(mark)) {
      return null;
    }
    switch (mark.type) {
      case "bold":
      case "italic":
      case "underline":
      case "strike":
      case "superscript":
      case "subscript":
        marks.push({ type: mark.type });
        break;
      default:
        return null;
    }
  }
  return marks;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
