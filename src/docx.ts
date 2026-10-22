import type { CompilePreferences } from "./bookCompile.ts";
import { buildCompile, type CompileDocument, type CompileParagraph, type CompileRun } from "./compileShape.ts";
import type { ProjectFile } from "./model/project.ts";
import type { Alignment } from "./pageLayout.ts";
import type { Mark } from "./model/editorDoc.ts";

const word = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const relationships = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const packageRelationships = "http://schemas.openxmlformats.org/package/2006/relationships";
const contentTypes = "http://schemas.openxmlformats.org/package/2006/content-types";

export type CompiledFile =
  | { kind: "empty" }
  | { kind: "docx"; bytes: Uint8Array; missing: string[] };

export function compiledFile(
  project: ProjectFile,
  included: ReadonlySet<string>,
  preferences: CompilePreferences,
  year: number,
): CompiledFile {
  const compiled = buildCompile(project, included, preferences, year);
  switch (compiled.hasDocument) {
    case false:
      return { kind: "empty" };
    case true:
      return { kind: "docx", bytes: compileDocx(compiled), missing: compiled.missing };
    default: {
      const unexpected: never = compiled.hasDocument;
      return unexpected;
    }
  }
}

export function compileDocx(doc: CompileDocument): Uint8Array {
  const files: { path: string; data: Uint8Array }[] = [
    { path: "[Content_Types].xml", data: xml(contentTypesXml(doc.differentFirstPage)) },
    { path: "_rels/.rels", data: xml(packageRels()) },
    { path: "docProps/core.xml", data: xml(coreXml(doc.title, doc.creator)) },
    { path: "word/document.xml", data: xml(documentXml(doc)) },
    { path: "word/styles.xml", data: xml(stylesXml(doc)) },
    { path: "word/_rels/document.xml.rels", data: xml(documentRels(doc.differentFirstPage)) },
    { path: "word/header1.xml", data: xml(storyXml("hdr", doc.header, doc)) },
    { path: "word/footer1.xml", data: xml(storyXml("ftr", doc.footer, doc)) },
  ];
  if (doc.differentFirstPage) {
    files.push(
      { path: "word/header2.xml", data: xml(storyXml("hdr", [], doc)) },
      { path: "word/footer2.xml", data: xml(storyXml("ftr", [], doc)) },
    );
  }
  return zipStore(files);
}

function documentXml(doc: CompileDocument): string {
  const paragraphs = doc.paragraphs.map((paragraph) => paragraphXml(paragraph, doc)).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${word}" xmlns:r="${relationships}">
  <w:body>${paragraphs}${sectionXml(doc)}</w:body>
</w:document>`;
}

function paragraphXml(paragraph: CompileParagraph, doc: CompileDocument): string {
  const properties = [
    paragraph.pageBreakBefore ? "<w:pageBreakBefore/>" : "",
    `<w:spacing w:before="${pointsToTwips(doc.spaceBefore)}" w:after="${pointsToTwips(doc.spaceAfter)}" w:line="${lineSpacing(doc.spacing)}" w:lineRule="auto"/>`,
    `<w:jc w:val="${justification(paragraph.align)}"/>`,
    paragraph.indent ? `<w:ind w:firstLine="${pointsToTwips(doc.indentInches * 72)}"/>` : "",
  ].join("");
  const runs = paragraph.runs.map((run) => runXml(run, doc)).join("");
  return `<w:p><w:pPr>${properties}</w:pPr>${runs}</w:p>`;
}

function runXml(run: CompileRun, doc: CompileDocument): string {
  switch (run.kind) {
    case "text":
      return `<w:r>${runProperties(doc, run.marks)}<w:t xml:space="preserve">${escapeXml(run.text)}</w:t></w:r>`;
    case "break":
      return `<w:r>${runProperties(doc, [])}<w:br/></w:r>`;
    case "page":
      return `<w:r>${runProperties(doc, [])}<w:fldChar w:fldCharType="begin"/></w:r><w:r>${runProperties(doc, [])}<w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r>${runProperties(doc, [])}<w:fldChar w:fldCharType="end"/></w:r>`;
    default: {
      const unexpected: never = run;
      return unexpected;
    }
  }
}

function runProperties(doc: CompileDocument, marks: readonly Mark[]): string {
  const font = escapeXml(doc.font);
  const size = String(Math.round(doc.points * 2));
  const extras = marks.map((mark) => markXml(mark)).join("");
  return `<w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:cs="${font}"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/>${extras}</w:rPr>`;
}

function markXml(mark: Mark): string {
  switch (mark.type) {
    case "bold":
      return "<w:b/>";
    case "italic":
      return "<w:i/>";
    case "underline":
      return `<w:u w:val="single"/>`;
    case "strike":
      return "<w:strike/>";
    case "superscript":
      return `<w:vertAlign w:val="superscript"/>`;
    case "subscript":
      return `<w:vertAlign w:val="subscript"/>`;
    default: {
      const unexpected: never = mark;
      return unexpected;
    }
  }
}

function sectionXml(doc: CompileDocument): string {
  const header = `<w:headerReference w:type="default" r:id="rIdHeader"/>`;
  const footer = `<w:footerReference w:type="default" r:id="rIdFooter"/>`;
  const first = doc.differentFirstPage
    ? `<w:headerReference w:type="first" r:id="rIdHeaderFirst"/><w:footerReference w:type="first" r:id="rIdFooterFirst"/>`
    : "";
  const title = doc.differentFirstPage ? "<w:titlePg/>" : "";
  return `<w:sectPr>${header}${footer}${first}<w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="${inchesToTwips(doc.margins.top)}" w:right="${inchesToTwips(doc.margins.right)}" w:bottom="${inchesToTwips(doc.margins.bottom)}" w:left="${inchesToTwips(doc.margins.left)}" w:header="720" w:footer="720" w:gutter="0"/>${title}</w:sectPr>`;
}

function storyXml(tag: "hdr" | "ftr", runs: readonly CompileRun[], doc: CompileDocument): string {
  const body = runs.map((run) => runXml(run, doc)).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:${tag} xmlns:w="${word}">
  <w:p>${body}</w:p>
</w:${tag}>`;
}

function stylesXml(doc: CompileDocument): string {
  const font = escapeXml(doc.font);
  const size = String(Math.round(doc.points * 2));
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="${word}">
  <w:docDefaults>
    <w:rPrDefault><w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}"/><w:sz w:val="${size}"/></w:rPr></w:rPrDefault>
    <w:pPrDefault><w:pPr><w:spacing w:line="${lineSpacing(doc.spacing)}" w:lineRule="auto"/></w:pPr></w:pPrDefault>
  </w:docDefaults>
</w:styles>`;
}

function contentTypesXml(differentFirstPage: boolean): string {
  const first = differentFirstPage
    ? `<Override PartName="/word/header2.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/footer2.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>`
    : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="${contentTypes}">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>
  <Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
  ${first}
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
</Types>`;
}

function packageRels(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="${packageRelationships}">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
</Relationships>`;
}

function documentRels(differentFirstPage: boolean): string {
  const first = differentFirstPage
    ? `<Relationship Id="rIdHeaderFirst" Type="${relationships}/header" Target="header2.xml"/><Relationship Id="rIdFooterFirst" Type="${relationships}/footer" Target="footer2.xml"/>`
    : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="${packageRelationships}">
  <Relationship Id="rIdHeader" Type="${relationships}/header" Target="header1.xml"/>
  <Relationship Id="rIdFooter" Type="${relationships}/footer" Target="footer1.xml"/>
  ${first}
  <Relationship Id="rIdStyles" Type="${relationships}/styles" Target="styles.xml"/>
</Relationships>`;
}

function coreXml(title: string, creator: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <dc:title>${escapeXml(title)}</dc:title>
  <dc:creator>${escapeXml(creator)}</dc:creator>
</cp:coreProperties>`;
}

function justification(align: Alignment): string {
  switch (align) {
    case "left":
      return "left";
    case "center":
      return "center";
    case "right":
      return "right";
    case "justify":
      return "both";
    default: {
      const unexpected: never = align;
      return unexpected;
    }
  }
}

function lineSpacing(spacing: CompileDocument["spacing"]): string {
  switch (spacing) {
    case "single":
      return "240";
    case "onehalf":
      return "360";
    case "double":
      return "480";
    default: {
      const unexpected: never = spacing;
      return unexpected;
    }
  }
}

function inchesToTwips(inches: number): string {
  return String(Math.round(inches * 1440));
}

function pointsToTwips(points: number): string {
  return String(Math.round(points * 20));
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function xml(source: string): Uint8Array {
  return new TextEncoder().encode(source);
}

function zipStore(files: { path: string; data: Uint8Array }[]): Uint8Array {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const name = new TextEncoder().encode(file.path);
    const crc = crc32(file.data);
    const local = concat([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(file.data.length),
      u32(file.data.length),
      u16(name.length),
      u16(0),
      name,
      file.data,
    ]);
    locals.push(local);
    centrals.push(
      concat([
        u32(0x02014b50),
        u16(20),
        u16(20),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(crc),
        u32(file.data.length),
        u32(file.data.length),
        u16(name.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(offset),
        name,
      ]),
    );
    offset += local.length;
  }
  const central = concat(centrals);
  const end = concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(central.length),
    u32(offset),
    u16(0),
  ]);
  return concat([...locals, central, end]);
}

const crcTable = new Uint32Array(256);
for (let index = 0; index < 256; index += 1) {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  crcTable[index] = value;
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = (crcTable[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(value: number): Uint8Array {
  const bytes = new Uint8Array(2);
  new DataView(bytes.buffer).setUint16(0, value, true);
  return bytes;
}

function u32(value: number): Uint8Array {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, true);
  return bytes;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const size = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
