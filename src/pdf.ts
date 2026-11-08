import type { HeadingAlign } from "./bookCompile.ts";
import type { Alignment } from "./pageLayout.ts";
import type { Mark } from "./model/editorDoc.ts";
import type { CompileDocument, CompileRun } from "./compileShape.ts";
import { openBook, type BookFonts, type EncodedFace, type FontLibrary, type FontStyle, type ShapedText } from "./pdfFont.ts";

const pageWidth = 612;
const pageHeight = 792;

type TextPiece = {
  shaped: ShapedText;
  size: number;
  rise: number;
  underline: boolean;
  strike: boolean;
};

type Word = { kind: "break" } | ({ kind: "text" } & TextPiece);

type DrawnLine = { pieces: TextPiece[]; width: number; align: Alignment; indent: number };
type Furniture = { shaped: ShapedText; size: number; align: HeadingAlign };
type Page = { lines: DrawnLine[]; y: number[]; header: Furniture | null; footer: Furniture | null };

export async function compilePdf(doc: CompileDocument, fonts: FontLibrary): Promise<Uint8Array> {
  const book = openBook(fonts);
  const pages = paginate(doc, book);
  let furniture: FontStyle | null = null;
  for (const [index, page] of pages.entries()) {
    const number = index + 1;
    const showHeader = doc.header.length > 0 && !(doc.differentFirstPage && index === 0);
    const showFooter = doc.footer.length > 0 && !(doc.differentFirstPage && index === 0);
    if (!showHeader && !showFooter) {
      continue;
    }
    furniture ??= book.style(doc.furnitureFont, false, false);
    page.header = showHeader
      ? { shaped: furniture.shape(furnitureText(doc.header, number), doc.furniturePoints), size: doc.furniturePoints, align: doc.headerAlign }
      : null;
    page.footer = showFooter
      ? { shaped: furniture.shape(furnitureText(doc.footer, number), doc.furniturePoints), size: doc.furniturePoints, align: doc.footerAlign }
      : null;
  }
  return writePdf(doc, pages, book.encode());
}

function paginate(doc: CompileDocument, book: BookFonts): Page[] {
  const leading = lineHeight(doc, doc.points);
  const left = doc.margins.left * 72;
  const right = pageWidth - doc.margins.right * 72;
  const contentWidth = Math.max(72, right - left);
  const top = pageHeight - doc.margins.top * 72;
  const bottom = doc.margins.bottom * 72 + (doc.footer.length > 0 ? leading : 0);
  const pages: Page[] = [];
  let page: Page = { lines: [], y: [], header: null, footer: null };
  let y = top;

  function nextPage() {
    pages.push(page);
    page = { lines: [], y: [], header: null, footer: null };
    y = top;
  }

  for (const paragraph of doc.paragraphs) {
    if (paragraph.pageBreakBefore && page.lines.length > 0) {
      nextPage();
    }
    y -= doc.spaceBefore;
    const lines = wrapParagraph(paragraph.runs, paragraph.align, paragraph.indent, doc, book, contentWidth);
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
  return pages;
}

function wrapParagraph(
  runs: readonly CompileRun[],
  align: Alignment,
  indentFirst: boolean,
  doc: CompileDocument,
  book: BookFonts,
  contentWidth: number,
): DrawnLine[] {
  const indent = indentFirst ? doc.indentInches * 72 : 0;
  const words = wordsOf(runs, doc, book);
  if (words.length === 0) {
    return [{ pieces: [], width: 0, align, indent: 0 }];
  }
  const lines: DrawnLine[] = [];
  let pieces: TextPiece[] = [];
  let width = 0;
  let limit = contentWidth - indent;
  function pushLine() {
    lines.push({ pieces, width, align, indent: lines.length === 0 ? indent : 0 });
    pieces = [];
    width = 0;
    limit = contentWidth;
  }
  for (const word of words) {
    if (word.kind === "break") {
      pushLine();
      continue;
    }
    if (pieces.length > 0 && width + word.shaped.width > limit) {
      pushLine();
    }
    pieces.push(word);
    width += word.shaped.width;
  }
  if (pieces.length > 0) {
    lines.push({ pieces, width, align, indent: lines.length === 0 ? indent : 0 });
  }
  const last = lines[lines.length - 1];
  if (align === "justify" && last) {
    last.align = "left";
  }
  return lines;
}

function wordsOf(runs: readonly CompileRun[], doc: CompileDocument, book: BookFonts): Word[] {
  const words: Word[] = [];
  let current = "";
  let style = book.style(doc.font, false, false);
  let nominal = doc.points;
  let look = lookOf([]);
  function flush() {
    if (!current) {
      return;
    }
    const drawn = scriptSize(nominal, look.script);
    const text = current;
    current = "";
    for (const part of text.split(/(\s+)/)) {
      if (!part) {
        continue;
      }
      words.push({
        kind: "text",
        shaped: style.shape(part, drawn.size),
        size: drawn.size,
        rise: drawn.rise,
        underline: look.underline,
        strike: look.strike,
      });
    }
  }
  for (const run of runs) {
    switch (run.kind) {
      case "break":
        flush();
        words.push({ kind: "break" });
        break;
      case "page":
        break;
      case "text": {
        const next = book.style(run.font || doc.font, marked(run.marks, "bold"), marked(run.marks, "italic"));
        const nextNominal = run.points && run.points > 0 ? run.points : doc.points;
        const nextLook = lookOf(run.marks);
        if (next !== style || nextNominal !== nominal || !sameLook(nextLook, look)) {
          flush();
          style = next;
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
  return words;
}

type Script = "base" | "super" | "sub";
type Look = { script: Script; underline: boolean; strike: boolean };

function lookOf(marks: readonly Mark[]): Look {
  let script: Script = "base";
  let underline = false;
  let strike = false;
  for (const mark of marks) {
    switch (mark.type) {
      case "bold":
      case "italic":
      case "textStyle":
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

function marked(marks: readonly Mark[], kind: "bold" | "italic"): boolean {
  return marks.some((mark) => mark.type === kind);
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

function lineSize(line: DrawnLine, fallback: number): number {
  let size = 0;
  for (const piece of line.pieces) {
    if (piece.size > size) {
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

function furnitureText(runs: readonly CompileRun[], pageNumber: number): string {
  return runs
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
}

type PdfPart = string | Uint8Array;

async function writePdf(doc: CompileDocument, pages: Page[], faces: EncodedFace[]): Promise<Uint8Array> {
  const left = doc.margins.left * 72;
  const contentWidth = pageWidth - doc.margins.left * 72 - doc.margins.right * 72;
  const [packedFaces, packedPages] = await Promise.all([
    Promise.all(faces.map((face) => packFace(face))),
    Promise.all(pages.map((page) => flate(asciiBytes(pageStream(page, left, contentWidth))))),
  ]);
  const objects: PdfPart[][] = [];
  function add(body: string | PdfPart[]): number {
    objects.push(typeof body === "string" ? [body] : body);
    return objects.length;
  }
  const writtenFaces = packedFaces.map((packed) => ({ resource: packed.face.resource, id: writeFace(add, packed) }));
  const resources = writtenFaces.map((face) => `/F${face.resource} ${face.id} 0 R`).join(" ");
  const contentIds = packedPages.map((packed) => add(streamParts(packed)));
  const pageIds = contentIds.map((contentId) =>
    add(
      `<< /Type /Page /Parent @@PAGES@@ 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Contents ${contentId} 0 R /Resources << /Font << ${resources} >> >> >>`,
    ),
  );
  const kids = pageIds.map((id) => `${id} 0 R`).join(" ");
  const pagesId = add(`<< /Type /Pages /Count ${pages.length} /Kids [${kids}] >>`);
  const catalog = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  const token = String(pagesId);
  for (const object of objects) {
    for (let index = 0; index < object.length; index += 1) {
      const part = object[index];
      if (typeof part === "string") {
        object[index] = part.split("@@PAGES@@").join(token);
      }
    }
  }
  return serialize(objects, catalog);
}

function pageStream(page: Page, left: number, contentWidth: number): string {
  const commands: string[] = [];
  if (page.header && page.header.shaped.glyphs.length > 0) {
    commands.push(drawFurniture(page.header, left, contentWidth, pageHeight - 36));
  }
  page.lines.forEach((line, index) => {
    const y = page.y[index] ?? 0;
    commands.push(drawLine(line, left, y, contentWidth));
  });
  if (page.footer && page.footer.shaped.glyphs.length > 0) {
    commands.push(drawFurniture(page.footer, left, contentWidth, 36));
  }
  return commands.filter((command) => command.length > 0).join("\n");
}

function drawFurniture(item: Furniture, left: number, contentWidth: number, y: number): string {
  return drawLine(
    {
      pieces: [{ shaped: item.shaped, size: item.size, rise: 0, underline: false, strike: false }],
      width: item.shaped.width,
      align: item.align,
      indent: 0,
    },
    left,
    y,
    contentWidth,
  );
}

function drawLine(line: DrawnLine, left: number, y: number, contentWidth: number): string {
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
  const commands: string[] = [];
  for (const piece of line.pieces) {
    if (piece.shaped.glyphs.length === 0) {
      continue;
    }
    commands.push(drawShaped(piece.shaped, piece.size, piece.rise, x, y, extra));
    commands.push(...decoration(piece, x, visualWidth(piece.shaped, extra), y));
    x += visualWidth(piece.shaped, extra);
  }
  return commands.filter((command) => command.length > 0).join("\n");
}

function drawShaped(shaped: ShapedText, size: number, rise: number, x: number, y: number, extra: number): string {
  const first = shaped.glyphs[0];
  if (!first || size <= 0) {
    return "";
  }
  const commands = ["BT", `${pdfNumber(rise)} Ts`, `/F${first.resource} ${pdfNumber(size)} Tf`];
  if (shaped.fauxBold) {
    commands.push(`${pdfNumber(Math.max(0.3, size * 0.03))} w`);
    commands.push("2 Tr");
  }
  const chunk: string[] = [];
  for (const glyph of shaped.glyphs) {
    chunk.push(`<${glyph.gid.toString(16).toUpperCase().padStart(4, "0")}>`);
    const step = glyph.advance + (glyph.space ? extra : 0);
    const thousandths = Math.round(((glyph.natural - step) / size) * 1000);
    if (thousandths !== 0) {
      chunk.push(String(thousandths));
    }
  }
  const shear = shaped.fauxItalic ? 0.2 : 0;
  commands.push(`1 0 ${pdfNumber(shear)} 1 ${pdfNumber(x)} ${pdfNumber(y)} Tm`);
  commands.push(`[${chunk.join(" ")}] TJ`);
  if (shaped.fauxBold) {
    commands.push("0 Tr");
  }
  commands.push("ET");
  return commands.join("\n");
}

function visualWidth(shaped: ShapedText, extra: number): number {
  if (extra <= 0) {
    return shaped.width;
  }
  return shaped.width + shaped.glyphs.filter((glyph) => glyph.space).length * extra;
}

function wordSpacing(line: DrawnLine, contentWidth: number): number {
  if (line.align !== "justify") {
    return 0;
  }
  const spaces = line.pieces.reduce((count, piece) => count + piece.shaped.glyphs.filter((glyph) => glyph.space).length, 0);
  if (spaces === 0) {
    return 0;
  }
  const extra = (contentWidth - line.indent - line.width) / spaces;
  return extra > 0.2 ? extra : 0;
}

function decoration(piece: TextPiece, x: number, width: number, baseline: number): string[] {
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

type PackedFace = { face: EncodedFace; program: Uint8Array; unicode: Uint8Array };

async function packFace(face: EncodedFace): Promise<PackedFace> {
  const [program, unicode] = await Promise.all([flate(face.program), flate(asciiBytes(toUnicode(face)))]);
  return { face, program, unicode };
}

function writeFace(add: (body: string | PdfPart[]) => number, packed: PackedFace): number {
  const face = packed.face;
  const fileDict = face.kind === "cff" ? "/Subtype /CIDFontType0C" : `/Length1 ${face.program.length}`;
  const file = add(streamParts(packed.program, fileDict));
  const flags = 32 | (face.italic ? 64 : 0);
  const fileKey = face.kind === "cff" ? "FontFile3" : "FontFile2";
  const descriptor = add(
    `<< /Type /FontDescriptor /FontName /${face.name} /Flags ${flags} /FontBBox [${face.bbox.join(" ")}] /ItalicAngle ${pdfNumber(face.italicAngle)} /Ascent ${face.ascent} /Descent ${face.descent} /CapHeight ${face.capHeight} /StemV 80 /${fileKey} ${file} 0 R >>`,
  );
  const widths = face.widths.map((item) => `${item.gid} [${item.width}]`).join(" ");
  const gidMap = face.kind === "cff" ? "" : " /CIDToGIDMap /Identity";
  const subtype = face.kind === "cff" ? "CIDFontType0" : "CIDFontType2";
  const cid = add(
    `<< /Type /Font /Subtype /${subtype} /BaseFont /${face.name} /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ${descriptor} 0 R /DW 500 /W [${widths}]${gidMap} >>`,
  );
  const mapId = add(streamParts(packed.unicode));
  return add(
    `<< /Type /Font /Subtype /Type0 /BaseFont /${face.name} /Encoding /Identity-H /DescendantFonts [${cid} 0 R] /ToUnicode ${mapId} 0 R >>`,
  );
}

function streamParts(packed: Uint8Array, extra = ""): PdfPart[] {
  const dict = extra.length > 0 ? `/Length ${packed.length} /Filter /FlateDecode ${extra}` : `/Length ${packed.length} /Filter /FlateDecode`;
  return [`<< ${dict} >>\nstream\n`, packed, "\nendstream"];
}

function asciiBytes(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length);
  for (let index = 0; index < text.length; index += 1) {
    bytes[index] = text.charCodeAt(index);
  }
  return bytes;
}

async function flate(bytes: Uint8Array): Promise<Uint8Array> {
  const input = new Uint8Array(bytes.byteLength);
  input.set(bytes);
  const stream = new Blob([input]).stream().pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function toUnicode(face: EncodedFace): string {
  const lines: string[] = [];
  for (let start = 0; start < face.characters.length; start += 100) {
    const chunk = face.characters.slice(start, start + 100);
    lines.push(`${chunk.length} beginbfchar`);
    for (const item of chunk) {
      lines.push(`<${item.gid.toString(16).toUpperCase().padStart(4, "0")}> <${utf16(item.codes)}>`);
    }
    lines.push("endbfchar");
  }
  return `/CIDInit /ProcSet findresource begin
12 dict begin
begincmap
/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def
/CMapName /Adobe-Identity-UCS def
/CMapType 2 def
1 begincodespacerange
<0000> <FFFF>
endcodespacerange
${lines.join("\n")}
endcmap
CMapName currentdict /CMap defineresource pop
end
end`;
}

function utf16(codes: number[]): string {
  let hex = "";
  for (const code of codes) {
    if (code > 0xffff) {
      const shifted = code - 0x10000;
      hex += (0xd800 + (shifted >> 10)).toString(16).padStart(4, "0");
      hex += (0xdc00 + (shifted & 0x3ff)).toString(16).padStart(4, "0");
    } else {
      hex += code.toString(16).padStart(4, "0");
    }
  }
  return hex.toUpperCase();
}

function pdfNumber(value: number): string {
  return String(Math.round(value * 100) / 100);
}

function serialize(objects: PdfPart[][], catalog: number): Uint8Array {
  const chunks: PdfPart[] = ["%PDF-1.4\n"];
  const offsets = [0];
  let length = partLength(chunks[0] ?? "");
  for (const [index, object] of objects.entries()) {
    offsets.push(length);
    const head = `${index + 1} 0 obj\n`;
    const tail = "\nendobj\n";
    chunks.push(head, ...object, tail);
    length += partLength(head) + partLength(tail);
    for (const part of object) {
      length += partLength(part);
    }
  }
  const xref = length;
  let trailer = `xref\n0 ${objects.length + 1}\n`;
  trailer += "0000000000 65535 f \n";
  trailer += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("");
  trailer += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  chunks.push(trailer);
  const bytes = new Uint8Array(length + trailer.length);
  let offset = 0;
  for (const chunk of chunks) {
    if (typeof chunk === "string") {
      for (let index = 0; index < chunk.length; index += 1) {
        bytes[offset] = chunk.charCodeAt(index);
        offset += 1;
      }
    } else {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
  }
  return bytes;
}

function partLength(part: PdfPart): number {
  return typeof part === "string" ? part.length : part.byteLength;
}
