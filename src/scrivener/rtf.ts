import { emptyDoc, type EditorDoc, type Inline, type Mark, type Paragraph } from "../model/editorDoc.ts";

const cp1252 =
  "\u20ac\u0081\u201a\u0192\u201e\u2026\u2020\u2021\u02c6\u2030\u0160\u2039\u0152\u008d\u017d\u008f\u0090\u2018\u2019\u201c\u201d\u2022\u2013\u2014\u02dc\u2122\u0161\u203a\u0153\u009d\u017e\u0178";

type Style = {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  super: boolean;
  sub: boolean;
  uc: number;
  destination: "body" | "skip";
  ignorable: boolean;
};

export function rtfToDoc(source: string): EditorDoc {
  const paragraphs: Paragraph[] = [];
  let runs: Inline[] = [];
  const stack: Style[] = [plainStyle()];
  let skipChars = 0;
  let index = 0;

  function style(): Style {
    return stack[stack.length - 1] ?? plainStyle();
  }

  function emit(text: string) {
    if (!text) {
      return;
    }
    let rest = text;
    if (skipChars > 0) {
      const skipped = Math.min(skipChars, rest.length);
      skipChars -= skipped;
      rest = rest.slice(skipped);
    }
    if (!rest || style().destination === "skip") {
      return;
    }
    appendText(runs, rest, marksOf(style()));
  }

  function consumeFallback() {
    if (skipChars > 0) {
      skipChars -= 1;
      return true;
    }
    return false;
  }

  function endParagraph() {
    if (style().destination === "skip") {
      return;
    }
    paragraphs.push(runs.length > 0 ? { type: "paragraph", content: runs } : { type: "paragraph" });
    runs = [];
  }

  function breakLine() {
    if (style().destination === "skip" || consumeFallback()) {
      return;
    }
    runs.push({ type: "hardBreak" });
  }

  while (index < source.length) {
    const char = source[index];
    if (char === "{") {
      stack.push({ ...style(), ignorable: false });
      index += 1;
      continue;
    }
    if (char === "}") {
      if (stack.length > 1) {
        stack.pop();
      }
      index += 1;
      continue;
    }
    if (char === "\\") {
      index += 1;
      const symbol = source[index];
      if (!symbol) {
        break;
      }
      if (!/[A-Za-z]/.test(symbol)) {
        index += 1;
        if (symbol === "*") {
          style().ignorable = true;
          continue;
        }
        if (symbol === "'") {
          const hex = source.slice(index, index + 2);
          index += 2;
          if (!/^[0-9a-fA-F]{2}$/.test(hex)) {
            continue;
          }
          const code = Number.parseInt(hex, 16);
          const text = code < 0x80 ? String.fromCharCode(code) : (cp1252[code - 0x80] ?? "");
          if (consumeFallback()) {
            continue;
          }
          emit(text);
          continue;
        }
        if (consumeFallback()) {
          continue;
        }
        if (symbol === "\\") {
          emit("\\");
        } else if (symbol === "{") {
          emit("{");
        } else if (symbol === "}") {
          emit("}");
        } else         if (symbol === "~") {
          emit("\u00a0");
        } else if (symbol === "_") {
          emit("-");
        } else if (symbol === "\n" || symbol === "\r") {
          endParagraph();
        }
        continue;
      }
      const word = readWord(source, index);
      if (!word) {
        continue;
      }
      index = word.next;
      if (word.word === "bin" && word.param !== null && word.param > 0) {
        index += word.param;
        continue;
      }
      if (style().ignorable) {
        style().ignorable = false;
        if (word.word !== "footnote" && word.word !== "annotation") {
          style().destination = "skip";
        }
        continue;
      }
      applyWord(style(), word.word, word.param, {
        emit,
        endParagraph,
        breakLine,
        unicode(code) {
          if (consumeFallback()) {
            return;
          }
          if (code >= 0 && code <= 0x10ffff) {
            emit(String.fromCodePoint(code));
          }
          skipChars = style().uc;
        },
      });
      continue;
    }
    if (char === "\n" || char === "\r") {
      index += 1;
      continue;
    }
    if (consumeFallback()) {
      index += 1;
      continue;
    }
    emit(char);
    index += 1;
  }

  if (runs.length > 0) {
    paragraphs.push({ type: "paragraph", content: runs });
  }
  return tidy(paragraphs);
}

function plainStyle(): Style {
  return {
    bold: false,
    italic: false,
    underline: false,
    strike: false,
    super: false,
    sub: false,
    uc: 1,
    destination: "body",
    ignorable: false,
  };
}

function readWord(
  source: string,
  start: number,
): { word: string; param: number | null; next: number } | null {
  let index = start;
  let word = "";
  while (index < source.length && /[A-Za-z]/.test(source[index] ?? "")) {
    word += source[index];
    index += 1;
  }
  if (!word) {
    return null;
  }
  let param: number | null = null;
  const sign = source[index] === "-" ? -1 : 1;
  if (source[index] === "-") {
    index += 1;
  }
  let digits = "";
  while (index < source.length && (source[index] ?? "") >= "0" && (source[index] ?? "") <= "9") {
    digits += source[index];
    index += 1;
  }
  if (digits) {
    param = sign * Number(digits);
  } else if (sign === -1) {
    index -= 1;
  }
  if (source[index] === " ") {
    index += 1;
  }
  return { word: word.toLowerCase(), param, next: index };
}

type WordActions = {
  emit: (text: string) => void;
  endParagraph: () => void;
  breakLine: () => void;
  unicode: (code: number) => void;
};

function applyWord(style: Style, word: string, param: number | null, actions: WordActions) {
  if (skipDestination(word)) {
    style.destination = "skip";
    return;
  }
  switch (word) {
    case "par":
    case "sect":
    case "page":
      actions.endParagraph();
      return;
    case "line":
      actions.breakLine();
      return;
    case "tab":
      actions.emit("\t");
      return;
    case "uc":
      style.uc = param ?? 1;
      return;
    case "u": {
      if (param === null) {
        return;
      }
      actions.unicode(param < 0 ? param + 65536 : param);
      return;
    }
    case "plain":
      style.bold = false;
      style.italic = false;
      style.underline = false;
      style.strike = false;
      style.super = false;
      style.sub = false;
      return;
    case "b":
      style.bold = param !== 0;
      return;
    case "i":
      style.italic = param !== 0;
      return;
    case "ul":
    case "uldb":
      style.underline = param !== 0;
      return;
    case "ulnone":
      style.underline = false;
      return;
    case "strike":
    case "striked":
      style.strike = param !== 0;
      return;
    case "super":
      style.super = true;
      style.sub = false;
      return;
    case "sub":
      style.sub = true;
      style.super = false;
      return;
    case "nosupersub":
      style.super = false;
      style.sub = false;
      return;
    case "lquote":
      actions.emit("\u2018");
      return;
    case "rquote":
      actions.emit("\u2019");
      return;
    case "ldblquote":
      actions.emit("\u201c");
      return;
    case "rdblquote":
      actions.emit("\u201d");
      return;
    case "endash":
      actions.emit("\u2013");
      return;
    case "emdash":
      actions.emit("\u2014");
      return;
    case "bullet":
      actions.emit("\u2022");
      return;
    default:
      return;
  }
}

function skipDestination(word: string): boolean {
  switch (word) {
    case "fonttbl":
    case "colortbl":
    case "stylesheet":
    case "info":
    case "pict":
    case "object":
    case "footer":
    case "footerf":
    case "header":
    case "headerf":
    case "fldinst":
    case "field":
    case "datafield":
    case "datastore":
    case "themedata":
    case "listtable":
    case "listoverridetable":
    case "listtext":
    case "pntext":
    case "expandedcolortbl":
    case "xmlnstbl":
    case "generator":
    case "latentstyles":
    case "colorschememapping":
    case "revtbl":
    case "rsidtbl":
    case "filetbl":
    case "nonshppict":
    case "shppict":
    case "background":
      return true;
    default:
      return false;
  }
}

function marksOf(style: Style): Mark[] | undefined {
  const marks: Mark[] = [];
  if (style.bold) {
    marks.push({ type: "bold" });
  }
  if (style.italic) {
    marks.push({ type: "italic" });
  }
  if (style.underline) {
    marks.push({ type: "underline" });
  }
  if (style.strike) {
    marks.push({ type: "strike" });
  }
  if (style.super) {
    marks.push({ type: "superscript" });
  }
  if (style.sub) {
    marks.push({ type: "subscript" });
  }
  return marks.length > 0 ? marks : undefined;
}

function appendText(runs: Inline[], text: string, marks: Mark[] | undefined) {
  const last = runs[runs.length - 1];
  if (last && last.type === "text" && sameMarks(last.marks, marks)) {
    last.text += text;
    return;
  }
  runs.push(marks ? { type: "text", text, marks } : { type: "text", text });
}

function sameMarks(left: Mark[] | undefined, right: Mark[] | undefined): boolean {
  if (!left && !right) {
    return true;
  }
  if (!left || !right || left.length !== right.length) {
    return false;
  }
  return left.every((mark, index) => mark.type === right[index]?.type);
}

function tidy(paragraphs: Paragraph[]): EditorDoc {
  const cleaned = paragraphs.map((paragraph) =>
    whitespaceOnly(paragraph) ? { type: "paragraph" as const } : paragraph,
  );
  while (cleaned.length > 0 && emptyParagraph(cleaned[0])) {
    cleaned.shift();
  }
  while (cleaned.length > 0 && emptyParagraph(cleaned[cleaned.length - 1])) {
    cleaned.pop();
  }
  if (cleaned.length === 0) {
    return emptyDoc();
  }
  return { type: "doc", content: cleaned };
}

function whitespaceOnly(paragraph: Paragraph): boolean {
  return (paragraph.content ?? []).every((inline) => inline.type === "text" && inline.text.trim().length === 0);
}

function emptyParagraph(paragraph: Paragraph | undefined): boolean {
  return paragraph !== undefined && (paragraph.content === undefined || paragraph.content.length === 0);
}
