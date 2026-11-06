import assert from "node:assert/strict";
import { test } from "node:test";
import { Schema } from "@tiptap/pm/model";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { marksInside } from "./find.ts";
import {
  applySpellMarks,
  dictionarySpellcheckKey,
  misspelledIn,
  projectDictionaryPlugin,
  rangesInChunks,
  spellingAwaiting,
  spellingMarksPlugin,
  spellingText,
  suggestionCase,
} from "./spellcheck.ts";

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

test("typing in another paragraph keeps the project word marked", () => {
  const plugin = projectDictionaryPlugin();
  const doc = schema.node("doc", null, [
    schema.node("paragraph", null, [schema.text("Hello Castus")]),
    schema.node("paragraph", null, [schema.text("Second")]),
  ]);
  let state = EditorState.create({ schema, doc, plugins: [plugin] });
  state = state.apply(state.tr.setMeta(dictionarySpellcheckKey, ["castus"]));
  const second = doc.child(0).nodeSize + 1;
  state = state.apply(state.tr.insertText("x", second));
  const words = dictionarySpellcheckKey
    .getState(state)
    ?.marks.find()
    .map((decoration) => state.doc.textBetween(decoration.from, decoration.to));
  assert.deepEqual(words, ["Castus"]);
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

function prose(text: string) {
  return schema.node("doc", null, [schema.node("paragraph", null, text ? [schema.text(text)] : [])]);
}

function at(doc: ReturnType<typeof prose>, pos: number) {
  return EditorState.create({
    schema,
    doc,
    plugins: [spellingMarksPlugin()],
    selection: TextSelection.create(doc, pos),
  });
}

function ready(doc: ReturnType<typeof prose>, pos: number) {
  return applySpellMarks(at(doc, pos), DecorationSet.empty);
}

function shownCount(state: EditorState) {
  const plugin = spellingMarksPlugin();
  const decorate = plugin.props.decorations;
  if (!decorate) {
    return 0;
  }
  const decorations = decorate.call(plugin, state);
  return decorations instanceof DecorationSet ? decorations.find().length : 0;
}

test("opening a scene waits for one check", () => {
  assert.equal(spellingAwaiting(at(prose("hello brekfast"), 1)), "scene");
  assert.equal(spellingAwaiting(at(prose("hello brekfast"), 3)), "scene");
  let state = at(prose(""), 1);
  state = state.apply(state.tr.insertText("hello brekfast"));
  assert.equal(spellingAwaiting(state), "scene");
});

test("a spelling result skips the word under the cursor", () => {
  const doc = prose("hello brekfast");
  const marks = DecorationSet.create(doc, [
    Decoration.inline(1, 6, { class: "misspelled" }),
    Decoration.inline(7, 15, { class: "misspelled" }),
  ]);
  const inside = applySpellMarks(at(doc, 3), marks);
  assert.deepEqual(misspelledIn(inside), ["brekfast"]);
  assert.equal(shownCount(inside), 2);
  assert.deepEqual(spellingAwaiting(inside), []);
  const before = applySpellMarks(at(doc, 1), marks);
  assert.deepEqual(misspelledIn(before), ["hello", "brekfast"]);
  assert.equal(shownCount(before), 2);
});

test("letters in a word are not checked, and a space or stop finishes it", () => {
  let state = ready(prose(""), 1);
  state = state.apply(state.tr.insertText("h"));
  state = state.apply(state.tr.insertText("e"));
  assert.deepEqual(spellingAwaiting(state), []);
  state = state.apply(state.tr.insertText(" "));
  assert.deepEqual(spellingAwaiting(state), ["he"]);
  state = ready(prose("hello"), 6);
  state = state.apply(state.tr.insertText(","));
  assert.deepEqual(spellingAwaiting(state), ["hello"]);
});

test("a pasted sentence checks the finished words and not the one still being typed", () => {
  let state = ready(prose(""), 1);
  state = state.apply(state.tr.insertText("hello world"));
  assert.deepEqual(spellingAwaiting(state), ["hello"]);
  state = state.apply(state.tr.insertText(" "));
  assert.deepEqual(spellingAwaiting(state), ["hello", "world"]);
});

test("a paste into a word checks the joined word the space finished", () => {
  const hello = prose("hello");
  let state = ready(hello, 4);
  state = state.apply(state.tr.insertText("XYZ world"));
  assert.equal(state.doc.textContent, "helXYZ worldlo");
  assert.deepEqual(spellingAwaiting(state), ["helXYZ"]);
});

test("leaving a word checks it, and moving inside it does not", () => {
  const hello = prose("hello");
  const end = ready(hello, 6);
  assert.deepEqual(spellingAwaiting(end.apply(end.tr.setSelection(TextSelection.create(hello, 4)))), []);
  const middle = ready(hello, 4);
  assert.deepEqual(spellingAwaiting(middle.apply(middle.tr.setSelection(TextSelection.create(hello, 1)))), [
    "hello",
  ]);
});

test("enter finishes the word", () => {
  const hello = prose("hello");
  const state = ready(hello, 6);
  assert.deepEqual(spellingAwaiting(state.apply(state.tr.split(6))), ["hello"]);
});

test("a hyphen stays inside the word", () => {
  const well = prose("well");
  const state = ready(well, 5);
  assert.deepEqual(spellingAwaiting(state.apply(state.tr.insertText("-"))), []);
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
