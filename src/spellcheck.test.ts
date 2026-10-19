import assert from "node:assert/strict";
import { test } from "node:test";
import { Schema } from "@tiptap/pm/model";
import { EditorState } from "@tiptap/pm/state";
import { DecorationSet } from "@tiptap/pm/view";
import { dictionarySpellcheckKey, projectDictionaryPlugin } from "./spellcheck.ts";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { content: "inline*", group: "block" },
    text: { group: "inline" },
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
