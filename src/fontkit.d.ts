declare module "fontkit" {
  export function create(buffer: Uint8Array | ArrayBuffer, postscriptName?: string): FontkitFont;

  export type FontkitGlyph = {
    id: number;
    codePoints: number[];
    advanceWidth: number;
  };

  export type FontkitFont = {
    fonts?: FontkitFont[];
    getFont?(name: string): FontkitFont | null;
    postscriptName: string;
    unitsPerEm: number;
    ascent: number;
    descent: number;
    capHeight?: number;
    italicAngle?: number;
    variationAxes?: Record<string, { min: number; default: number; max: number }>;
    bbox: { minX: number; minY: number; maxX: number; maxY: number };
    hasGlyphForCodePoint(codePoint: number): boolean;
    layout(text: string): {
      glyphs: FontkitGlyph[];
      positions: { xAdvance: number; xOffset: number; yOffset: number }[];
    };
    createSubset(): {
      includeGlyph(glyph: number): number;
      encode(): Uint8Array;
    };
  };
}
