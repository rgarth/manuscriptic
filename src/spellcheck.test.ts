import assert from "node:assert/strict";
import { test } from "node:test";
import { Schema } from "@tiptap/pm/model";
import { EditorState } from "@tiptap/pm/state";
import { DecorationSet } from "@tiptap/pm/view";
import { marksInside } from "./find.ts";
import { dictionarySpellcheckKey, projectDictionaryPlugin, rangesInChunks, spellingText, suggestionCase } from "./spellcheck.ts";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { content: "inline*", group: "block" },
    text: { group: "inline" },
  },
  marks: {
    strong: {},
  },
});

function marked(words: string[], text: string): string[] {
  const plugin = projectDictionaryPlugin();
  const doc = schema.node("doc", null, [schema.node("paragraph", null, [schema.text(text)])]);
  const base = EditorState.create({ schema, doc, plugins: [plugin] });
  const state = base.apply(base.tr.setMeta(dictionarySpellcheckKey, words));
  const decorate = plugin.props.decorations;
  if (!decorate) {
    return [];
  }
  const decorations = decorate.call(plugin, state);
  if (!(decorations instanceof DecorationSet)) {
    return [];
  }
  return decorations.find().map((decoration) => state.doc.textBetween(decoration.from, decoration.to));
}

test("a project word is left alone by the spellcheck, including a different casing", () => {
  assert.deepEqual(marked(["castus"], "Hello Castus"), ["Castus"]);
  assert.deepEqual(marked([], "Hello Castus"), []);
  assert.deepEqual(marked(["Lyra"], "Hello Castus"), []);
});

test("replacing a word keeps the marks on that word", () => {
  const strong = schema.marks.strong.create();
  const doc = schema.node("doc", null, [
    schema.node("paragraph", null, [
      schema.text("Hello "),
      schema.text("brekfast", [strong]),
      schema.text(" today"),
    ]),
  ]);
  const from = 1 + "Hello ".length;
  assert.equal(doc.textBetween(from, from + "brekfast".length), "brekfast");
  assert.deepEqual(
    marksInside(doc, from).map((mark) => mark.type.name),
    ["strong"],
  );
  assert.deepEqual(
    marksInside(doc, 1).map((mark) => mark.type.name),
    [],
  );
  const opening = schema.node("doc", null, [
    schema.node("paragraph", null, [schema.text("Brekfast", [strong]), schema.text(" was fine")]),
  ]);
  assert.deepEqual(
    marksInside(opening, 1).map((mark) => mark.type.name),
    ["strong"],
  );
});

test("a suggestion keeps the capitalization of the word it replaces", () => {
  assert.equal(suggestionCase("breakfast", "brekfast"), "breakfast");
  assert.equal(suggestionCase("breakfast", "Brekfast"), "Breakfast");
  assert.equal(suggestionCase("breakfast", "BREKFAST"), "BREAKFAST");
});

test("a misspelling keeps its place and a dictionary word is skipped", () => {
  const doc = schema.node("doc", null, [
    schema.node("paragraph", null, [schema.text("Hello Castus")]),
    schema.node("paragraph", null, [schema.text("The sisteren waited")]),
  ]);
  const collected = spellingText(doc);
  const castus = collected.joined.indexOf("Castus");
  const sisteren = collected.joined.indexOf("sisteren");
  const marks = rangesInChunks(
    collected.chunks,
    [
      { from: castus, to: castus + "Castus".length },
      { from: sisteren, to: sisteren + "sisteren".length },
    ],
    new Set(["castus"]),
  );
  assert.deepEqual(
    marks.map((range) => doc.textBetween(range.from, range.to)),
    ["sisteren"],
  );
});
