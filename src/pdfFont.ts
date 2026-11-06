import { create, type FontkitFont } from "fontkit";
import { subsetFont } from "./glyfSubset.ts";

export type FontBytes = {
  bytes: Uint8Array;
  postscript: string;
  index: number;
};

export type FontFiles = {
  regular: FontBytes | null;
  bold: FontBytes | null;
  italic: FontBytes | null;
  boldItalic: FontBytes | null;
};

export type FontLibrary = ReadonlyMap<string, FontFiles>;

export type DrawnGlyph = {
  gid: number;
  advance: number;
  natural: number;
  space: boolean;
  resource: number;
};

export type ShapedText = {
  glyphs: DrawnGlyph[];
  width: number;
  fauxBold: boolean;
  fauxItalic: boolean;
};

export type EncodedFace = {
  name: string;
  kind: "ttf" | "cff";
  program: Uint8Array;
  italic: boolean;
  resource: number;
  ascent: number;
  descent: number;
  capHeight: number;
  italicAngle: number;
  bbox: [number, number, number, number];
  widths: { gid: number; width: number }[];
  characters: { gid: number; codes: number[] }[];
};

type Subset = ReturnType<FontkitFont["createSubset"]>;

type Physical = {
  font: FontkitFont;
  subset: Subset;
  gids: Map<number, number>;
  widths: Map<number, number>;
  codes: Map<number, number[]>;
  fauxItalic: boolean;
  resource: number;
};

export type FontSlot = "regular" | "bold" | "italic" | "boldItalic";

export type FontStyle = {
  fauxBold: boolean;
  fauxItalic: boolean;
  shape(text: string, size: number): ShapedText;
};

export type BookFonts = {
  style(family: string, bold: boolean, italic: boolean): FontStyle;
  encode(): EncodedFace[];
};

export function openBook(library: FontLibrary): BookFonts {
  const opened = new Map<string, Map<string, FontStyle>>();
  const physicals: Physical[] = [];

  function style(family: string, bold: boolean, italic: boolean): FontStyle {
    const key = `${bold ? "b" : ""}${italic ? "i" : ""}`;
    let styles = opened.get(family);
    if (!styles) {
      styles = new Map();
      opened.set(family, styles);
    }
    const existing = styles.get(key);
    if (existing) {
      return existing;
    }
    const files = library.get(family);
    if (!files) {
      throw new Error(`Could not find the font ${family}.`);
    }
    const slot = pickSlot(files, family, bold, italic);
    const face = openPhysical(slot.file, family, physicals.length);
    physicals.push(face);
    const drawn = faceStyle(face, slot.kind, bold, italic);
    face.fauxItalic = drawn.fauxItalic;
    const shaped: FontStyle = {
      fauxBold: drawn.fauxBold,
      fauxItalic: drawn.fauxItalic,
      shape(text, size) {
        return shapeText(face, text, size, drawn.fauxBold, drawn.fauxItalic);
      },
    };
    styles.set(key, shaped);
    return shaped;
  }

  return {
    style,
    encode() {
      const faces: EncodedFace[] = [];
      for (const face of physicals) {
        if (face.gids.size === 0) {
          continue;
        }
        faces.push(encodeFace(face));
      }
      return faces;
    },
  };
}

function pickSlot(files: FontFiles, family: string, bold: boolean, italic: boolean): { kind: FontSlot; file: FontBytes } {
  for (const kind of slotOrder(bold, italic)) {
    const file = files[kind];
    if (file) {
      return { kind, file };
    }
  }
  throw new Error(`Could not find the font ${family}.`);
}

function slotOrder(bold: boolean, italic: boolean): readonly FontSlot[] {
  const request = bold && italic ? "boldItalic" : bold ? "bold" : italic ? "italic" : "regular";
  switch (request) {
    case "boldItalic":
      return ["boldItalic", "bold", "italic", "regular"];
    case "bold":
      return ["bold", "regular", "italic"];
    case "italic":
      return ["italic", "regular", "bold"];
    case "regular":
      return ["regular", "bold", "italic"];
    default: {
      const unexpected: never = request;
      return unexpected;
    }
  }
}

function faceStyle(part: Physical, slot: FontSlot, bold: boolean, italic: boolean): { fauxBold: boolean; fauxItalic: boolean } {
  const variableWeight = part.font.variationAxes?.wght !== undefined;
  const realItalic = (part.font.italicAngle ?? 0) !== 0;
  const heavyDefault = (part.font.variationAxes?.wght?.default ?? 400) >= 600;
  const namedBold = slot === "bold" || slot === "boldItalic";
  const realBold = namedBold && (!variableWeight || heavyDefault);
  return { fauxBold: bold && !realBold, fauxItalic: italic && !realItalic };
}

function openPhysical(file: FontBytes, family: string, resource: number): Physical {
  const font = openFontFile(file, family);
  return {
    font,
    subset: subsetFont(font),
    gids: new Map(),
    widths: new Map(),
    codes: new Map(),
    fauxItalic: false,
    resource,
  };
}

function openFontFile(file: FontBytes, family: string): FontkitFont {
  let opened: FontkitFont;
  try {
    opened = create(file.bytes);
  } catch {
    throw new Error(`Could not read the font ${family}.`);
  }
  const faces = opened.fonts;
  if (!faces || faces.length === 0) {
    return opened;
  }
  if (file.postscript && opened.getFont) {
    const named = opened.getFont(file.postscript);
    if (named) {
      return named;
    }
  }
  return faces[file.index] ?? faces[0] ?? opened;
}

function shapeText(part: Physical, text: string, size: number, fauxBold: boolean, fauxItalic: boolean): ShapedText {
  const glyphs: DrawnGlyph[] = [];
  let width = 0;
  const run = part.font.layout(text);
  for (let index = 0; index < run.glyphs.length; index += 1) {
    const glyph = run.glyphs[index];
    const position = run.positions[index];
    if (!glyph || !position) {
      continue;
    }
    const units = part.font.unitsPerEm || 1000;
    const advance = (position.xAdvance * size) / units;
    const drawn: DrawnGlyph = {
      gid: remember(part, glyph.id, glyph.advanceWidth, glyph.codePoints),
      advance,
      natural: (glyph.advanceWidth * size) / units,
      space: glyph.codePoints.length === 1 && glyph.codePoints[0] === 32,
      resource: part.resource,
    };
    glyphs.push(drawn);
    width += advance;
  }
  return { glyphs, width, fauxBold, fauxItalic };
}

function remember(part: Physical, glyphId: number, advance: number, codes: number[]): number {
  const existing = part.gids.get(glyphId);
  if (existing !== undefined) {
    return existing;
  }
  const gid = part.subset.includeGlyph(glyphId);
  part.gids.set(glyphId, gid);
  part.widths.set(gid, advance);
  part.codes.set(gid, codes);
  return gid;
}

function encodeFace(part: Physical): EncodedFace {
  let program: Uint8Array;
  try {
    program = Uint8Array.from(part.subset.encode());
  } catch {
    throw new Error(`Could not embed the font ${part.font.postscriptName || "face"}.`);
  }
  const units = part.font.unitsPerEm || 1000;
  const scale = (value: number) => Math.round((value * 1000) / units);
  const box = part.font.bbox;
  const widths = [...part.widths.entries()].map(([gid, advance]) => ({ gid, width: scale(advance) }));
  const characters = [...part.codes.entries()].map(([gid, codes]) => ({ gid, codes }));
  const angle = part.font.italicAngle ?? 0;
  return {
    name: pdfName(part.font.postscriptName || "Font", part.resource),
    kind: program[0] === 1 && program[1] === 0 ? "cff" : "ttf",
    program,
    italic: part.fauxItalic || angle !== 0,
    resource: part.resource,
    ascent: scale(part.font.ascent),
    descent: scale(part.font.descent),
    capHeight: scale(part.font.capHeight ?? part.font.ascent * 0.7),
    italicAngle: angle,
    bbox: [scale(box.minX), scale(box.minY), scale(box.maxX), scale(box.maxY)],
    widths,
    characters,
  };
}

function pdfName(postscript: string, index: number): string {
  const clean = postscript.replace(/[^A-Za-z0-9-]/g, "") || "Font";
  let hash = 2166136261 ^ index;
  let prefix = "";
  for (let step = 0; step < 6; step += 1) {
    prefix += String.fromCharCode(65 + (Math.abs(hash) % 26));
    hash = Math.floor(hash / 26);
  }
  return `${prefix}+${clean}`;
}
