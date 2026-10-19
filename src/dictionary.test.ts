import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanWord, includesWord, uniqueWords, wordAt } from "./dictionary.ts";

test("a project word keeps its spelling and ignores a second casing", () => {
  assert.equal(cleanWord("  Castus "), "Castus");
  assert.equal(cleanWord("two words"), null);
  assert.deepEqual(uniqueWords(["Castus", "castus", "O'Brien", ""]), ["Castus", "O'Brien"]);
  assert.equal(includesWord(["Castus"], "castus"), true);
  assert.equal(includesWord(["Castus"], "Lyra"), false);
});

test("the word under the cursor is the one to add", () => {
  const text = "Hello  Castus.";
  assert.equal(wordAt(text, text.indexOf("Castus"))?.word, "Castus");
  assert.equal(wordAt(text, text.indexOf("Castus") + "Castus".length)?.word, "Castus");
  assert.equal(wordAt(text, text.indexOf("  ") + 1)?.word, undefined);
});
