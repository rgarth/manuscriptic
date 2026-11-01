import type { Alignment } from "./pageLayout.ts";
import type { Mark } from "./model/editorDoc.ts";
import type { CompileDocument, CompileParagraph, CompileRun } from "./compileShape.ts";

const pageWidth = 612;
const pageHeight = 792;

type Face = {
  name: string;
  family: "times" | "helvetica" | "courier";
  bold: boolean;
};

type Script = "base" | "super" | "sub";

type Look = {
  script: Script;
  underline: boolean;
  strike: boolean;
};

type Piece = {
  text: string;
  face: Face;
  size: number;
  rise: number;
  underline: boolean;
  strike: boolean;
};
type DrawnLine = { pieces: Piece[]; width: number; align: Alignment; indent: number };
type Page = { lines: DrawnLine[]; y: number[] };

export function compilePdf(doc: CompileDocument): Uint8Array {
  return encodePdf(doc, paginate(doc));
}

function paginate(doc: CompileDocument): { pages: Page[]; faces: Face[] } {
  const faces: Face[] = [];
  const leading = lineHeight(doc, doc.points);
  const left = doc.margins.left * 72;
  const right = pageWidth - doc.margins.right * 72;
  const contentWidth = Math.max(72, right - left);
  const top = pageHeight - doc.margins.top * 72;
  const bottom = doc.margins.bottom * 72 + (doc.footer.length > 0 ? leading : 0);
  faceFor(doc.font, [], faces);
  const pages: Page[] = [];
  let page: Page = { lines: [], y: [] };
  let y = top;

  function nextPage() {
    pages.push(page);
    page = { lines: [], y: [] };
    y = top;
  }

  for (const paragraph of doc.paragraphs) {
    if (paragraph.pageBreakBefore && page.lines.length > 0) {
      nextPage();
    }
    y -= doc.spaceBefore;
    const lines = wrapParagraph(paragraph, doc, contentWidth, faces);
    for (const line of lines) {
      const advance = lineHeight(doc, lineSize(line, doc.points));
      if (y - advance < bottom && page.lines.length > 0) {
        nextPage();
      }
      page.lines.push(line);
      page.y.push(y);
      y -= advance;
    }
    y -= doc.spaceAfter;
  }
  if (page.lines.length > 0 || pages.length === 0) {
    pages.push(page);
  }
  return { pages, faces };
}

function wrapParagraph(paragraph: CompileParagraph, doc: CompileDocument, contentWidth: number, faces: Face[]): DrawnLine[] {
  const indent = paragraph.indent ? doc.indentInches * 72 : 0;
  const words = wordsOf(paragraph.runs, doc, faces);
  if (words.length === 0) {
    return [{ pieces: [], width: 0, align: paragraph.align, indent: 0 }];
  }
  const lines: DrawnLine[] = [];
  let pieces: Piece[] = [];
  let width = 0;
  let limit = contentWidth - indent;
  function pushLine() {
    lines.push({ pieces, width, align: paragraph.align, indent: lines.length === 0 ? indent : 0 });
    pieces = [];
    width = 0;
    limit = contentWidth;
  }
  for (const word of words) {
    if (word.text === "\n") {
      pushLine();
      continue;
    }
    const wordWidth = measure(word.text, word.face, word.size);
    if (pieces.length > 0 && width + wordWidth > limit) {
      pushLine();
    }
    pieces.push(word);
    width += wordWidth;
  }
  if (pieces.length > 0) {
    lines.push({ pieces, width, align: paragraph.align, indent: lines.length === 0 ? indent : 0 });
  }
  const last = lines[lines.length - 1];
  if (paragraph.align === "justify" && lines.length > 1 && last) {
    last.align = "left";
  }
  return lines;
}

function wordsOf(runs: readonly CompileRun[], doc: CompileDocument, faces: Face[]): Piece[] {
  const words: Piece[] = [];
  let current = "";
  let face = faceFor(doc.font, [], faces);
  let nominal = doc.points;
  let look = lookOf([]);
  function flush() {
    if (!current) {
      return;
    }
    const drawn = scriptSize(nominal, look.script);
    words.push({
      text: current,
      face,
      size: drawn.size,
      rise: drawn.rise,
      underline: look.underline,
      strike: look.strike,
    });
    current = "";
  }
  for (const run of runs) {
    switch (run.kind) {
      case "break":
        flush();
        words.push({ text: "\n", face, size: nominal, rise: 0, underline: false, strike: false });
        break;
      case "page":
        break;
      case "text": {
        const next = faceFor(run.font || doc.font, run.marks, faces);
        const nextNominal = run.points && run.points > 0 ? run.points : doc.points;
        const nextLook = lookOf(run.marks);
        if (next.name !== face.name || nextNominal !== nominal || !sameLook(nextLook, look)) {
          flush();
          face = next;
          nominal = nextNominal;
          look = nextLook;
        }
        current += run.text;
        break;
      }
      default: {
        const unexpected: never = run;
        return unexpected;
      }
    }
  }
  flush();
  return words.flatMap((word) => splitWords(word));
}

function splitWords(piece: Piece): Piece[] {
  if (piece.text === "\n") {
    return [piece];
  }
  const parts = piece.text.split(/(\s+)/);
  return parts.filter((part) => part.length > 0).map((text) => ({ ...piece, text }));
}

function lookOf(marks: readonly Mark[]): Look {
  let script: Script = "base";
  let underline = false;
  let strike = false;
  for (const mark of marks) {
    switch (mark.type) {
      case "bold":
      case "italic":
        break;
      case "underline":
        underline = true;
        break;
      case "strike":
        strike = true;
        break;
      case "superscript":
        script = "super";
        break;
      case "subscript":
        script = "sub";
        break;
      default: {
        const unexpected: never = mark;
        return unexpected;
      }
    }
  }
  return { script, underline, strike };
}

function sameLook(left: Look, right: Look): boolean {
  return left.script === right.script && left.underline === right.underline && left.strike === right.strike;
}

function scriptSize(nominal: number, script: Script): { size: number; rise: number } {
  switch (script) {
    case "base":
      return { size: nominal, rise: 0 };
    case "super":
      return { size: scale(nominal, 0.6), rise: scale(nominal, 0.33) };
    case "sub":
      return { size: scale(nominal, 0.6), rise: scale(nominal, -0.2) };
    default: {
      const unexpected: never = script;
      return unexpected;
    }
  }
}

function scale(nominal: number, factor: number): number {
  return Math.round(nominal * factor * 100) / 100;
}

function faceFor(font: string, marks: readonly Mark[], faces: Face[]): Face {
  const family = fontFamily(font);
  const bold = marks.some((mark) => mark.type === "bold");
  const italic = marks.some((mark) => mark.type === "italic");
  const name = fontName(family, bold, italic);
  const found = faces.find((face) => face.name === name);
  if (found) {
    return found;
  }
  const face = { name, family, bold };
  faces.push(face);
  return face;
}

function fontFamily(font: string): Face["family"] {
  const name = font.toLowerCase();
  if (name.includes("courier") || name.includes("mono") || name.includes("consolas")) {
    return "courier";
  }
  if (name.includes("helvetica") || name.includes("arial") || name.includes("calibri") || name.includes("sans")) {
    return "helvetica";
  }
  return "times";
}

function fontName(family: Face["family"], bold: boolean, italic: boolean): string {
  switch (family) {
    case "courier":
      if (bold && italic) return "Courier-BoldOblique";
      if (bold) return "Courier-Bold";
      if (italic) return "Courier-Oblique";
      return "Courier";
    case "helvetica":
      if (bold && italic) return "Helvetica-BoldOblique";
      if (bold) return "Helvetica-Bold";
      if (italic) return "Helvetica-Oblique";
      return "Helvetica";
    case "times":
      if (bold && italic) return "Times-BoldItalic";
      if (bold) return "Times-Bold";
      if (italic) return "Times-Italic";
      return "Times-Roman";
    default: {
      const unexpected: never = family;
      return unexpected;
    }
  }
}

function lineSize(line: DrawnLine, fallback: number): number {
  let size = 0;
  for (const piece of line.pieces) {
    if (piece.text !== "\n" && piece.size > size) {
      size = piece.size;
    }
  }
  return size > 0 ? size : fallback;
}

function lineHeight(doc: CompileDocument, size: number): number {
  switch (doc.spacing) {
    case "single":
      return size * 1.15;
    case "onehalf":
      return size * 1.5;
    case "double":
      return size * 2;
    default: {
      const unexpected: never = doc.spacing;
      return unexpected;
    }
  }
}

function measure(text: string, face: Face, size: number): number {
  if (face.family === "courier") {
    return text.length * size * 0.6;
  }
  let width = 0;
  for (const char of text) {
    width += (unitWidth(char, face.family) / 1000) * size * (face.bold ? 1.06 : 1);
  }
  return width;
}

function unitWidth(char: string, family: "times" | "helvetica"): number {
  if (char === " ") {
    return family === "times" ? 250 : 278;
  }
  if ("ilj.,'`:;!".includes(char)) {
    return family === "times" ? 278 : 278;
  }
  if ("mwMW".includes(char)) {
    return family === "times" ? 833 : 833;
  }
  if (char >= "A" && char <= "Z") {
    return family === "times" ? 667 : 667;
  }
  return family === "times" ? 444 : 500;
}

function encodePdf(doc: CompileDocument, laid: { pages: Page[]; faces: Face[] }): Uint8Array {
  const left = doc.margins.left * 72;
  const fontCount = laid.faces.length;
  const pageCount = laid.pages.length;
  const fontId = (index: number) => index + 1;
  const contentId = (index: number) => fontCount + index + 1;
  const pageId = (index: number) => fontCount + pageCount + index + 1;
  const pagesId = fontCount + pageCount * 2 + 1;
  const catalogId = pagesId + 1;
  const objects = new Array<string>(catalogId);
  function put(id: number, body: string) {
    objects[id - 1] = body;
  }
  laid.faces.forEach((face, index) => {
    put(fontId(index), `<< /Type /Font /Subtype /Type1 /BaseFont /${face.name} >>`);
  });
  const fonts = laid.faces.map((_, index) => `/F${index} ${fontId(index)} 0 R`).join(" ");
  laid.pages.forEach((page, index) => {
    const showHeader = doc.header.length > 0 && !(doc.differentFirstPage && index === 0);
    const showFooter = doc.footer.length > 0 && !(doc.differentFirstPage && index === 0);
    const stream = pageStream(doc, page, laid.faces, left, index + 1, showHeader, showFooter);
    put(contentId(index), `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    put(
      pageId(index),
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Contents ${contentId(index)} 0 R /Resources << /Font << ${fonts} >> >> >>`,
    );
  });
  const kids = laid.pages.map((_, index) => `${pageId(index)} 0 R`).join(" ");
  put(pagesId, `<< /Type /Pages /Count ${pageCount} /Kids [${kids}] >>`);
  put(catalogId, `<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  return serialize(objects, catalogId);
}

function pageStream(
  doc: CompileDocument,
  page: Page,
  faces: Face[],
  left: number,
  pageNumber: number,
  showHeader: boolean,
  showFooter: boolean,
): string {
  const commands: string[] = [];
  if (showHeader) {
    commands.push(furniture(doc.header, faces, doc, left, pageHeight - 36, pageWidth - doc.margins.right * 72, pageNumber));
  }
  page.lines.forEach((line, index) => {
    const y = page.y[index] ?? 0;
    commands.push(drawLine(line, faces, left, y, pageWidth - doc.margins.left * 72 - doc.margins.right * 72));
  });
  if (showFooter) {
    commands.push(furniture(doc.footer, faces, doc, left, 36, pageWidth - doc.margins.right * 72, pageNumber));
  }
  return commands.filter((command) => command.length > 0).join("\n");
}

function furniture(runs: readonly CompileRun[], faces: Face[], doc: CompileDocument, left: number, y: number, right: number, pageNumber: number): string {
  const text = runs
    .map((run) => {
      switch (run.kind) {
        case "text":
          return run.text;
        case "break":
          return " ";
        case "page":
          return String(pageNumber);
        default: {
          const unexpected: never = run;
          return unexpected;
        }
      }
    })
    .join("");
  const face = faces.find((item) => item.name === fontName(fontFamily(doc.font), false, false)) ?? faces[0];
  if (!face) {
    return "";
  }
  const width = measure(text, face, doc.points);
  return drawLine(
    { pieces: [{ text, face, size: doc.points, rise: 0, underline: false, strike: false }], width, align: "left", indent: 0 },
    faces,
    left,
    y,
    right - left,
  );
}

function drawLine(line: DrawnLine, faces: Face[], left: number, y: number, contentWidth: number): string {
  if (line.pieces.length === 0) {
    return "";
  }
  let x = left + line.indent;
  if (line.align === "center") {
    x += Math.max(0, (contentWidth - line.indent - line.width) / 2);
  } else if (line.align === "right") {
    x += Math.max(0, contentWidth - line.indent - line.width);
  }
  const extra = wordSpacing(line, contentWidth);
  const parts: string[] = ["BT"];
  if (extra > 0) {
    parts.push(`${extra.toFixed(2)} Tw`);
  }
  let placed = false;
  let rise = 0;
  let cursor = x;
  const strokes: string[] = [];
  for (const piece of line.pieces) {
    if (piece.text === "\n") {
      continue;
    }
    const faceIndex = faces.indexOf(piece.face);
    if (!placed) {
      parts.push(`${x.toFixed(2)} ${y.toFixed(2)} Td`);
      placed = true;
    }
    if (piece.rise !== rise) {
      parts.push(`${pdfNumber(piece.rise)} Ts`);
      rise = piece.rise;
    }
    parts.push(`/F${faceIndex} ${pdfNumber(piece.size)} Tf`);
    parts.push(`(${escapePdf(piece.text)}) Tj`);
    const visual = measure(piece.text, piece.face, piece.size) + spaceCount(piece.text) * extra;
    strokes.push(...decoration(piece, cursor, visual, y));
    cursor += visual;
  }
  parts.push("ET");
  return [...parts, ...strokes].join("\n");
}

function wordSpacing(line: DrawnLine, contentWidth: number): number {
  if (line.align !== "justify") {
    return 0;
  }
  const spaces = line.pieces.reduce((count, piece) => count + spaceCount(piece.text), 0);
  if (spaces === 0) {
    return 0;
  }
  const extra = (contentWidth - line.indent - line.width) / spaces;
  return extra > 0.2 ? extra : 0;
}

function spaceCount(text: string): number {
  let count = 0;
  for (const char of text) {
    if (char === " ") {
      count += 1;
    }
  }
  return count;
}

function decoration(piece: Piece, x: number, width: number, baseline: number): string[] {
  if ((!piece.underline && !piece.strike) || width <= 0) {
    return [];
  }
  const weight = pdfNumber(Math.max(0.4, piece.size * 0.05));
  const commands = [`${weight} w`];
  if (piece.underline) {
    commands.push(...rule(x, baseline + piece.rise - piece.size * 0.15, width));
  }
  if (piece.strike) {
    commands.push(...rule(x, baseline + piece.rise + piece.size * 0.3, width));
  }
  return commands;
}

function rule(x: number, y: number, width: number): string[] {
  return [`${pdfNumber(x)} ${pdfNumber(y)} m`, `${pdfNumber(x + width)} ${pdfNumber(y)} l`, "S"];
}

function pdfNumber(value: number): string {
  return String(Math.round(value * 100) / 100);
}

function escapePdf(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function serialize(objects: string[], catalog: number): Uint8Array {
  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n`;
  body += "0000000000 65535 f \n";
  for (const offset of offsets.slice(1)) {
    body += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(body);
}
