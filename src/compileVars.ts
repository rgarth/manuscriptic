import type { EditorBlock, EditorDoc, Inline, TextRun } from "./model/editorDoc.ts";

export type CompileValues = {
  author: string;
  pen: string;
  address: string;
  phone: string;
  email: string;
  title: string;
  words: string;
  year: string;
};

export type FillPlace = "body" | "furniture";

export type FillPart =
  | { kind: "text"; text: string }
  | { kind: "break" }
  | { kind: "page" };

const known = new Set(["author", "pen", "address", "phone", "email", "title", "words", "year", "page"]);
const pattern = /\{\$([^}]*)\}/g;

export function fillText(
  source: string,
  values: CompileValues,
  place: FillPlace,
): { parts: FillPart[]; missing: string[] } {
  const missing = new Set<string>();
  const parts = fillParts(source, values, place, missing);
  return { parts, missing: [...missing] };
}

export function fillDocument(doc: EditorDoc, values: CompileValues): { doc: EditorDoc; missing: string[] } {
  const missing = new Set<string>();
  return {
    doc: { type: "doc", content: doc.content.map((block) => fillBlock(block, values, missing)) },
    missing: [...missing],
  };
}

function fillBlock(block: EditorBlock, values: CompileValues, missing: Set<string>): EditorBlock {
  switch (block.type) {
    case "paragraph":
      return { ...block, content: fillInlines(block.content ?? [], values, missing) };
    case "bulletList":
    case "orderedList":
      return {
        ...block,
        content: block.content.map((item) => ({
          ...item,
          content: item.content.map((child) => fillBlock(child, values, missing)),
        })),
      };
    default: {
      const unexpected: never = block;
      return unexpected;
    }
  }
}

function fillInlines(inlines: readonly Inline[], values: CompileValues, missing: Set<string>): Inline[] {
  const next: Inline[] = [];
  for (const inline of inlines) {
    switch (inline.type) {
      case "hardBreak":
        next.push(inline);
        break;
      case "text":
        next.push(...partsToInlines(fillParts(inline.text, values, "body", missing), inline.marks));
        break;
      default: {
        const unexpected: never = inline;
        return unexpected;
      }
    }
  }
  return next;
}

function partsToInlines(parts: FillPart[], marks: TextRun["marks"]): Inline[] {
  const inlines: Inline[] = [];
  for (const part of parts) {
    switch (part.kind) {
      case "text":
        if (part.text) {
          inlines.push(marks ? { type: "text", text: part.text, marks } : { type: "text", text: part.text });
        }
        break;
      case "break":
        inlines.push({ type: "hardBreak" });
        break;
      case "page":
        inlines.push({ type: "text", text: "{$page}", ...(marks ? { marks } : {}) });
        break;
      default: {
        const unexpected: never = part;
        return unexpected;
      }
    }
  }
  return inlines;
}

function storedValue(name: string, values: CompileValues): string {
  switch (name) {
    case "author":
    case "pen":
    case "address":
    case "phone":
    case "email":
    case "title":
    case "words":
    case "year":
      return values[name];
    default:
      return "";
  }
}

function fillParts(source: string, values: CompileValues, place: FillPlace, missing: Set<string>): FillPart[] {
  const parts: FillPart[] = [];
  let cursor = 0;
  for (const match of source.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > cursor) {
      parts.push({ kind: "text", text: source.slice(cursor, index) });
    }
    const name = match[1] ?? "";
    parts.push(...replaceToken(match[0], name, values, place, missing));
    cursor = index + match[0].length;
  }
  if (cursor < source.length) {
    parts.push({ kind: "text", text: source.slice(cursor) });
  }
  return parts;
}

function replaceToken(
  token: string,
  name: string,
  values: CompileValues,
  place: FillPlace,
  missing: Set<string>,
): FillPart[] {
  if (!known.has(name)) {
    missing.add(name);
    return [{ kind: "text", text: token }];
  }
  if (name === "page") {
    if (place === "body") {
      missing.add(name);
      return [{ kind: "text", text: token }];
    }
    return [{ kind: "page" }];
  }
  const value = storedValue(name, values);
  if (!value) {
    missing.add(name);
    return [{ kind: "text", text: token }];
  }
  const lines = value.split("\n");
  const parts: FillPart[] = [];
  lines.forEach((line, index) => {
    if (index > 0) {
      parts.push({ kind: "break" });
    }
    if (line) {
      parts.push({ kind: "text", text: line });
    }
  });
  return parts;
}
