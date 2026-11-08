import type { CompileDocument, CompileRun } from "./compileShape.ts";
import type { FontBytes, FontFiles, FontLibrary, FontSlot } from "./pdfFont.ts";
import { readFont } from "./storage.ts";

export async function loadCompileFonts(doc: CompileDocument): Promise<FontLibrary> {
  const wanted = familiesIn(doc);
  const library = new Map<string, FontFiles>();
  await Promise.all(
    [...wanted.entries()].map(async ([family, styles]) => {
      const files = emptyFiles();
      await Promise.all(
        [...styles].map(async (style) => {
          files[style] = await systemFace(family, style);
        }),
      );
      if (!files.regular && !files.bold && !files.italic && !files.boldItalic) {
        throw new Error(`Could not find the font ${family}.`);
      }
      library.set(family, files);
    }),
  );
  return library;
}

function familiesIn(doc: CompileDocument): Map<string, Set<FontSlot>> {
  const wanted = new Map<string, Set<FontSlot>>();
  function add(family: string, bold: boolean, italic: boolean) {
    const name = family || doc.font;
    let styles = wanted.get(name);
    if (!styles) {
      styles = new Set();
      wanted.set(name, styles);
    }
    styles.add("regular");
    styles.add(styleName(bold, italic));
  }
  add(doc.font, false, false);
  if (doc.header.length > 0 || doc.footer.length > 0) {
    add(doc.furnitureFont, false, false);
  }
  for (const paragraph of doc.paragraphs) {
    for (const run of paragraph.runs) {
      if (run.kind !== "text") {
        continue;
      }
      add(run.font || doc.font, marked(run, "bold"), marked(run, "italic"));
    }
  }
  return wanted;
}

function styleName(bold: boolean, italic: boolean): FontSlot {
  if (bold && italic) {
    return "boldItalic";
  }
  if (bold) {
    return "bold";
  }
  if (italic) {
    return "italic";
  }
  return "regular";
}

function marked(run: CompileRun, kind: "bold" | "italic"): boolean {
  return run.kind === "text" && run.marks.some((mark) => mark.type === kind);
}

const fontHeader = 8;

async function systemFace(family: string, style: FontSlot): Promise<FontBytes | null> {
  const bold = style === "bold" || style === "boldItalic";
  const italic = style === "italic" || style === "boldItalic";
  let raw: ArrayBuffer | number[];
  try {
    raw = await readFont(family, bold, italic);
  } catch {
    return null;
  }
  const packed = unpackFont(raw);
  if (bold && packed.weight < 600) {
    return null;
  }
  if (italic && !packed.italic) {
    return null;
  }
  return packed;
}

function unpackFont(value: ArrayBuffer | Uint8Array | number[]): FontBytes & { weight: number; italic: boolean } {
  const packed = packedBytes(value);
  if (packed.byteLength < fontHeader) {
    throw new Error("Could not read the font.");
  }
  const view = new DataView(packed.buffer, packed.byteOffset, packed.byteLength);
  const index = view.getUint32(0, true);
  const weight = view.getUint16(4, true);
  const italic = view.getUint8(6) === 1;
  const nameLength = view.getUint8(7);
  const nameEnd = fontHeader + nameLength;
  if (packed.byteLength < nameEnd) {
    throw new Error("Could not read the font.");
  }
  const postscript = new TextDecoder().decode(packed.subarray(fontHeader, nameEnd));
  return { bytes: packed.slice(nameEnd), postscript, index, weight, italic };
}

function packedBytes(value: ArrayBuffer | Uint8Array | number[]): Uint8Array {
  if (value instanceof Uint8Array) {
    return value;
  }
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }
  return Uint8Array.from(value);
}

function emptyFiles(): FontFiles {
  return { regular: null, bold: null, italic: null, boldItalic: null };
}
