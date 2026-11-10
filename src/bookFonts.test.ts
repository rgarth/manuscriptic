import assert from "node:assert/strict";
import { test } from "node:test";
import { createNovelProject, documentNode, setPageLayout } from "./model/project.ts";
import {
  collectBookFonts,
  displayFontFamily,
  missingBookFonts,
  rewriteBookFonts,
} from "./bookFonts.ts";

test("displayFontFamily quotes the named face", () => {
  assert.equal(displayFontFamily("Liberation Serif"), `"Liberation Serif", serif`);
  assert.equal(displayFontFamily("Comic Sans MS"), `"Comic Sans MS", serif`);
});

test("collectBookFonts includes layout, compile body, headings, and scene marks", () => {
  let project = createNovelProject();
  project = setPageLayout(project, { ...project.layout, font: "Times New Roman" });
  const scene = documentNode("Opening", "scene", {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Hi",
            marks: [{ type: "textStyle", attrs: { fontFamily: "Courier New" } }],
          },
        ],
      },
    ],
  });
  project = {
    ...project,
    manuscript: { ...project.manuscript, children: [scene, ...project.manuscript.children] },
    compile: {
      ...project.compile,
      presets: project.compile.presets.map((preset) => ({
        ...preset,
        scenes: { ...preset.scenes, titleFont: "Palatino", nameFont: "" },
        levels: preset.levels.map((level, index) =>
          index === 0 ? { ...level, nameFont: "Goudy Old Style", titleFont: "" } : level,
        ),
      })),
    },
  };
  const names = collectBookFonts(project);
  assert.ok(names.includes("Times New Roman"));
  assert.ok(names.includes("Liberation Serif"));
  assert.ok(names.includes("Courier New"));
  assert.ok(names.includes("Palatino"));
  assert.ok(names.includes("Goudy Old Style"));
  assert.ok(!names.includes(""));
});

test("missingBookFonts lists faces that are not available", () => {
  let project = createNovelProject();
  project = setPageLayout(project, { ...project.layout, font: "Times New Roman" });
  const available = ["Liberation Serif", "Liberation Sans"];
  assert.deepEqual(missingBookFonts(project, available), ["Times New Roman"]);
  assert.deepEqual(missingBookFonts(project, [...available, "Times New Roman"]), []);
});

test("rewriteBookFonts updates layout, compile body, headings, and scene marks", () => {
  let project = createNovelProject();
  project = setPageLayout(project, { ...project.layout, font: "Times New Roman" });
  const scene = documentNode("Opening", "scene", {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Hi",
            marks: [{ type: "textStyle", attrs: { fontFamily: "Times New Roman" } }],
          },
        ],
      },
    ],
  });
  project = {
    ...project,
    manuscript: { ...project.manuscript, children: [scene, ...project.manuscript.children] },
    compile: {
      ...project.compile,
      presets: project.compile.presets.map((preset) => ({
        ...preset,
        format: { ...preset.format, font: "Times New Roman" },
        scenes: { ...preset.scenes, titleFont: "Times New Roman", nameFont: "" },
        levels: preset.levels.map((level, index) =>
          index === 0 ? { ...level, nameFont: "Times New Roman", titleFont: "" } : level,
        ),
      })),
    },
  };
  const rewritten = rewriteBookFonts(project, { "Times New Roman": "Liberation Serif" });
  assert.equal(rewritten.layout.font, "Liberation Serif");
  assert.equal(rewritten.compile.presets[0]?.format.font, "Liberation Serif");
  assert.equal(rewritten.compile.presets[0]?.scenes.titleFont, "Liberation Serif");
  assert.equal(rewritten.compile.presets[0]?.scenes.nameFont, "");
  assert.equal(rewritten.compile.presets[0]?.levels[0]?.nameFont, "Liberation Serif");
  assert.equal(rewritten.compile.presets[0]?.levels[0]?.titleFont, "");
  const mark = rewritten.manuscript.children[0];
  assert.ok(mark && mark.kind === "document");
  const run = mark.content.content[0];
  assert.ok(run && run.type === "paragraph");
  const text = run.content?.[0];
  assert.ok(text && text.type === "text");
  assert.equal(text.marks?.[0]?.type === "textStyle" ? text.marks[0].attrs.fontFamily : null, "Liberation Serif");
  assert.deepEqual(missingBookFonts(rewritten, ["Liberation Serif"]), []);
});
