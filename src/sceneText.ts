import type {
  BulletList,
  EditorBlock,
  EditorDoc,
  Inline,
  ListItem,
  Mark,
  OrderedList,
  TextRun,
} from "./model/editorDoc.ts";

const markOrder = ["bold", "italic", "underline", "strike", "superscript", "subscript"] as const;

const markTag: Record<Mark["type"], string> = {
  bold: "b",
  italic: "i",
  underline: "u",
  strike: "s",
  superscript: "sup",
  subscript: "sub",
};

export function encodeScene(doc: EditorDoc): string {
  return `${doc.content.map((block) => encodeBlock(block)).join("\n")}\n`;
}

export function decodeScene(text: string): EditorDoc | null {
  const lines = text.endsWith("\n") ? text.slice(0, -1).split("\n") : text.split("\n");
  if (text === "") {
    return { type: "doc", content: [] };
  }
  const content: EditorBlock[] = [];
  const stack: Frame[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? "";
    index += 1;
    if (line === "end") {
      if (!stack.pop()) {
        return null;
      }
      continue;
    }
    if (line === "ul" || line.startsWith("ol")) {
      const list = decodeList(line);
      const where = blocksAt(content, stack);
      if (!list || !where) {
        return null;
      }
      where.push(list);
      stack.push({ kind: "list", items: list.content });
      continue;
    }
    if (line === "li") {
      const parent = stack[stack.length - 1];
      if (!parent || parent.kind !== "list") {
        return null;
      }
      const item: ListItem = { type: "listItem", content: [] };
      parent.items.push(item);
      stack.push({ kind: "item", blocks: item.content });
      continue;
    }
    if (line === "p" || line.startsWith("p ")) {
      const paragraph = decodeParagraph(line);
      const where = blocksAt(content, stack);
      if (!paragraph || !where) {
        return null;
      }
      where.push(paragraph);
      continue;
    }
    return null;
  }
  if (stack.length > 0) {
    return null;
  }
  return { type: "doc", content };
}

type Frame = { kind: "list"; items: ListItem[] } | { kind: "item"; blocks: EditorBlock[] };

function blocksAt(root: EditorBlock[], stack: Frame[]): EditorBlock[] | null {
  const top = stack[stack.length - 1];
  if (!top) {
    return root;
  }
  return top.kind === "item" ? top.blocks : null;
}

function decodeList(line: string): BulletList | OrderedList | null {
  if (line === "ul") {
    return { type: "bulletList", content: [] };
  }
  if (line === "ol") {
    return { type: "orderedList", content: [] };
  }
  const match = /^ol (\d+)$/.exec(line);
  if (!match) {
    return null;
  }
  const start = Number(match[1]);
  if (!Number.isInteger(start) || start < 1) {
    return null;
  }
  return start === 1
    ? { type: "orderedList", content: [] }
    : { type: "orderedList", attrs: { start }, content: [] };
}

function encodeBlock(block: EditorBlock): string {
  switch (block.type) {
    case "paragraph":
      return encodeParagraph(block.content);
    case "bulletList":
      return ["ul", ...block.content.map((item) => encodeItem(item)), "end"].join("\n");
    case "orderedList": {
      const start = block.attrs?.start;
      const head = start && start !== 1 ? `ol ${start}` : "ol";
      return [head, ...block.content.map((item) => encodeItem(item)), "end"].join("\n");
    }
    default: {
      const unexpected: never = block;
      return unexpected;
    }
  }
}

function encodeItem(item: ListItem): string {
  return ["li", ...item.content.map((block) => encodeBlock(block)), "end"].join("\n");
}

function encodeParagraph(content: Inline[] | undefined): string {
  const text = (content ?? []).map((inline) => encodeInline(inline)).join("");
  return text.length > 0 ? `p ${text}` : "p";
}

function encodeInline(inline: Inline): string {
  switch (inline.type) {
    case "hardBreak":
      return "[[br]]";
    case "text":
      return `${openMarks(inline)}${escapeText(inline.text)}${closeMarks(inline)}`;
    default: {
      const unexpected: never = inline;
      return unexpected;
    }
  }
}

function openMarks(run: TextRun): string {
  return ordered(run.marks).map((mark) => `[[${markTag[mark.type]}]]`).join("");
}

function closeMarks(run: TextRun): string {
  return [...ordered(run.marks)].reverse().map((mark) => `[[/${markTag[mark.type]}]]`).join("");
}

function ordered(marks: Mark[] | undefined): Mark[] {
  const present = new Set((marks ?? []).map((mark) => mark.type));
  return markOrder.filter((type) => present.has(type)).map((type) => ({ type }));
}

function escapeText(text: string): string {
  return text.replace(/\[\[/g, "[[[[");
}

function decodeParagraph(line: string): EditorBlock | null {
  const raw = line === "p" ? "" : line.slice(2);
  const content = decodeInlines(raw);
  if (!content) {
    return null;
  }
  return content.length > 0 ? { type: "paragraph", content } : { type: "paragraph" };
}

function decodeInlines(raw: string): Inline[] | null {
  const content: Inline[] = [];
  let text = "";
  const open: Mark["type"][] = [];
  let index = 0;
  function flush() {
    if (text.length === 0) {
      return;
    }
    const run: TextRun = open.length > 0 ? { type: "text", text, marks: open.map((type) => ({ type })) } : { type: "text", text };
    content.push(run);
    text = "";
  }
  while (index < raw.length) {
    if (!raw.startsWith("[[", index)) {
      text += raw[index];
      index += 1;
      continue;
    }
    if (raw.startsWith("[[[[", index)) {
      text += "[[";
      index += 4;
      continue;
    }
    const close = /^\[\[\/([a-z]+)\]\]/.exec(raw.slice(index));
    const start = /^\[\[([a-z]+)\]\]/.exec(raw.slice(index));
    if (close) {
      flush();
      const type = markType(close[1] ?? "");
      if (!type || open[open.length - 1] !== type) {
        return null;
      }
      open.pop();
      index += close[0].length;
      continue;
    }
    if (start?.[1] === "br") {
      flush();
      content.push({ type: "hardBreak" });
      index += start[0].length;
      continue;
    }
    if (start) {
      flush();
      const type = markType(start[1] ?? "");
      if (!type) {
        return null;
      }
      open.push(type);
      index += start[0].length;
      continue;
    }
    return null;
  }
  if (open.length > 0) {
    return null;
  }
  flush();
  return content;
}

function markType(tag: string): Mark["type"] | null {
  switch (tag) {
    case "b":
      return "bold";
    case "i":
      return "italic";
    case "u":
      return "underline";
    case "s":
      return "strike";
    case "sup":
      return "superscript";
    case "sub":
      return "subscript";
    default:
      return null;
  }
}
