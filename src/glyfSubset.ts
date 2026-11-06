import { type FontkitFont } from "fontkit";

type Subset = ReturnType<FontkitFont["createSubset"]>;

const onCurve = 1;
const xShort = 2;
const yShort = 4;
const repeatFlag = 8;
const sameX = 16;
const sameY = 32;

type GlyphPath = {
  commands: { command: string; args: number[] }[];
  bbox: { minX: number; minY: number; maxX: number; maxY: number };
};

type GlyfGlyph = {
  advanceWidth: number;
  path: GlyphPath;
  _getMetrics(): { leftBearing: number };
};

type GlyfFont = FontkitFont & {
  getGlyph(id: number): GlyfGlyph;
};

type GlyfSubset = Subset & {
  font: GlyfFont;
  glyf: Uint8Array[];
  loca: { offsets: number[] };
  hmtx: { metrics: { advance: number; bearing: number }[] };
  offset: number;
  _addGlyph(gid: number): number;
};

export function subsetFont(font: FontkitFont): Subset {
  const subset = font.createSubset();
  if (!isGlyfSubset(subset)) {
    return subset;
  }
  subset._addGlyph = (gid) => addGlyph(subset, gid);
  return subset;
}

function isGlyfSubset(subset: Subset): subset is GlyfSubset {
  const candidate = subset as GlyfSubset;
  return typeof candidate._addGlyph === "function" && typeof candidate.font.getGlyph === "function";
}

function addGlyph(subset: GlyfSubset, gid: number): number {
  const glyph = subset.font.getGlyph(gid);
  const buffer = encodeOutline(glyph.path);
  subset.glyf.push(buffer);
  subset.loca.offsets.push(subset.offset);
  subset.hmtx.metrics.push({ advance: glyph.advanceWidth, bearing: glyph._getMetrics().leftBearing });
  subset.offset += buffer.length;
  return subset.glyf.length - 1;
}

function encodeOutline(path: GlyphPath): Uint8Array {
  const ends: number[] = [];
  const xs: number[] = [];
  const ys: number[] = [];
  const flags: number[] = [];
  let same = 0;
  let lastX = 0;
  let lastY = 0;
  let lastFlag = 0;
  let points = 0;
  for (let index = 0; index < path.commands.length; index += 1) {
    const command = path.commands[index];
    if (!command) {
      continue;
    }
    if (
      command.command !== "moveTo" &&
      command.command !== "lineTo" &&
      command.command !== "quadraticCurveTo" &&
      command.command !== "closePath"
    ) {
      throw new Error("Could not embed the font.");
    }
    for (let arg = 0; arg < command.args.length; arg += 2) {
      const x = Math.round(command.args[arg] ?? 0);
      const y = Math.round(command.args[arg + 1] ?? 0);
      if (command.command === "quadraticCurveTo" && arg === 2 && omitImpliedPoint(path.commands, index, x, y, lastX, lastY)) {
        continue;
      }
      let flag = command.command === "quadraticCurveTo" && arg === 0 ? 0 : onCurve;
      flag = encodeDelta(x, lastX, xs, flag, xShort, sameX);
      flag = encodeDelta(y, lastY, ys, flag, yShort, sameY);
      const previous = flags[flags.length - 1];
      if (flag === lastFlag && same < 255 && previous !== undefined) {
        flags[flags.length - 1] = previous | repeatFlag;
        same += 1;
      } else {
        if (same > 0) {
          flags.push(same);
          same = 0;
        }
        flags.push(flag);
        lastFlag = flag;
      }
      lastX = x;
      lastY = y;
      points += 1;
    }
    if (command.command === "closePath" && points > 0) {
      ends.push(points - 1);
    }
  }
  const last = path.commands[path.commands.length - 1];
  if (path.commands.length > 1 && last?.command !== "closePath" && points > 0) {
    ends.push(points - 1);
  }
  if (points === 0) {
    return new Uint8Array();
  }
  return packOutline(ends, flags, xs, ys, path.bbox);
}

function omitImpliedPoint(
  commands: GlyphPath["commands"],
  index: number,
  x: number,
  y: number,
  lastX: number,
  lastY: number,
): boolean {
  const next = commands[index + 1];
  if (next?.command !== "quadraticCurveTo") {
    return false;
  }
  return x === Math.round((lastX + (next.args[0] ?? 0)) / 2) && y === Math.round((lastY + (next.args[1] ?? 0)) / 2);
}

function encodeDelta(value: number, last: number, points: number[], flag: number, shortFlag: number, sameFlag: number): number {
  const diff = value - last;
  if (value === last) {
    return flag | sameFlag;
  }
  if (diff >= -255 && diff <= 255) {
    points.push(Math.abs(diff));
    return flag | shortFlag | (diff >= 0 ? sameFlag : 0);
  }
  points.push(diff);
  return flag;
}

function packOutline(ends: number[], flags: number[], xs: number[], ys: number[], bbox: GlyphPath["bbox"]): Uint8Array {
  const bytes: number[] = [];
  writeInt16(bytes, ends.length);
  writeInt16(bytes, bbox.minX);
  writeInt16(bytes, bbox.minY);
  writeInt16(bytes, bbox.maxX);
  writeInt16(bytes, bbox.maxY);
  for (const end of ends) {
    writeUint16(bytes, end);
  }
  writeUint16(bytes, 0);
  bytes.push(...flags);
  for (const point of xs) {
    writePoint(bytes, point);
  }
  for (const point of ys) {
    writePoint(bytes, point);
  }
  const tail = (4 - (bytes.length % 4)) % 4;
  for (let index = 0; index < tail; index += 1) {
    bytes.push(0);
  }
  return Uint8Array.from(bytes);
}

function writeInt16(bytes: number[], value: number): void {
  writeUint16(bytes, Math.round(value));
}

function writeUint16(bytes: number[], value: number): void {
  const clipped = value < 0 ? value + 65536 : value;
  bytes.push((clipped >> 8) & 255, clipped & 255);
}

function writePoint(bytes: number[], value: number): void {
  if (value >= 0 && value <= 255) {
    bytes.push(value);
    return;
  }
  writeInt16(bytes, value);
}
