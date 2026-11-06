import { Extension } from "@tiptap/core";
import type { Node as ProseNode } from "@tiptap/pm/model";
import { EditorState, Plugin, PluginKey, type Transaction } from "@tiptap/pm/state";
import { ReplaceStep } from "@tiptap/pm/transform";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { EditorView } from "@tiptap/pm/view";
import { wordAt, wordsIn } from "./dictionary.ts";
import { reportFailure } from "./failures.ts";

type DictionaryState = { known: Set<string>; marks: DecorationSet };

export const dictionarySpellcheckKey = new PluginKey<DictionaryState>("project-dictionary");

type SpelledWord = { from: number; to: number; text: string };

type SpellingState = {
  marks: DecorationSet;
  shown: DecorationSet;
  scene: boolean;
  words: SpelledWord[];
};

const spellingMarksKey = new PluginKey<SpellingState>("spelling-marks");
const spellDelay = 200;
const rebuildDictionaryMarks = "rebuild-dictionary-marks";

export type SpellingRange = { from: number; to: number };

export type TextChunk = { pos: number; start: number; text: string };

export function spellingText(doc: ProseNode): { joined: string; chunks: TextChunk[] } {
  const chunks: TextChunk[] = [];
  let joined = "";
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) {
      return;
    }
    if (chunks.length > 0) {
      joined += "\n";
    }
    chunks.push({ pos, start: joined.length, text: node.text });
    joined += node.text;
  });
  return { joined, chunks };
}

export function rangesInChunks(
  chunks: readonly TextChunk[],
  ranges: readonly SpellingRange[],
  known: ReadonlySet<string>,
): SpellingRange[] {
  const marks: SpellingRange[] = [];
  for (const range of ranges) {
    const chunk = chunks.find(
      (item) => range.from >= item.start && range.to <= item.start + item.text.length,
    );
    if (!chunk) {
      continue;
    }
    const localFrom = range.from - chunk.start;
    const word = chunk.text.slice(localFrom, range.to - chunk.start);
    if (!word || known.has(word.toLocaleLowerCase())) {
      continue;
    }
    marks.push({ from: chunk.pos + localFrom, to: chunk.pos + (range.to - chunk.start) });
  }
  return marks;
}

export const projectDictionary = Extension.create({
  name: "projectDictionary",
  addProseMirrorPlugins() {
    return [projectDictionaryPlugin(), spellingMarksPlugin()];
  },
});

export function projectDictionaryPlugin(): Plugin<DictionaryState> {
  return new Plugin<DictionaryState>({
    key: dictionarySpellcheckKey,
    state: {
      init() {
        return { known: new Set<string>(), marks: DecorationSet.empty };
      },
      apply(tr, value, _old, state) {
        const incoming = knownWords(tr.getMeta(dictionarySpellcheckKey));
        const known = incoming ?? value.known;
        if (incoming || tr.getMeta(rebuildDictionaryMarks)) {
          return { known, marks: dictionaryMarks(state.doc, known) };
        }
        if (!tr.docChanged || known.size === 0) {
          return value;
        }
        return { known, marks: value.marks.map(tr.mapping, state.doc) };
      },
    },
    props: {
      decorations(state) {
        return dictionarySpellcheckKey.getState(state)?.marks ?? DecorationSet.empty;
      },
    },
  });
}

function knownWords(value: unknown): Set<string> | null {
  if (!Array.isArray(value)) {
    return null;
  }
  return new Set(
    value.filter((word): word is string => typeof word === "string").map((word) => word.toLocaleLowerCase()),
  );
}

function dictionaryMarks(doc: ProseNode, known: ReadonlySet<string>): DecorationSet {
  if (known.size === 0) {
    return DecorationSet.empty;
  }
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) {
      return;
    }
    for (const found of wordsIn(node.text)) {
      if (!known.has(found.word.toLocaleLowerCase())) {
        continue;
      }
      decorations.push(Decoration.inline(pos + found.from, pos + found.to, { spellcheck: "false" }));
    }
  });
  return decorations.length > 0 ? DecorationSet.create(doc, decorations) : DecorationSet.empty;
}

function withoutKnownMarks(doc: ProseNode, marks: DecorationSet, known: ReadonlySet<string>): DecorationSet {
  const all = marks.find();
  const kept = all.filter(
    (decoration) => !known.has(doc.textBetween(decoration.from, decoration.to).toLocaleLowerCase()),
  );
  if (kept.length === all.length) {
    return marks;
  }
  return kept.length > 0 ? DecorationSet.create(doc, kept) : DecorationSet.empty;
}

function wordAround(doc: ProseNode, pos: number): SpelledWord | null {
  const clamped = Math.min(Math.max(pos, 0), doc.content.size);
  const $pos = doc.resolve(clamped);
  if (!$pos.parent.isTextblock) {
    return null;
  }
  const origin = $pos.start();
  const text = $pos.parent.textBetween(0, $pos.parent.content.size, "\n", "\0");
  const index = Math.min(Math.max(clamped - origin, 0), text.length);
  const word = wordAt(text, index);
  if (!word) {
    return null;
  }
  return { from: origin + word.from, to: origin + word.to, text: word.word };
}

function wordBeingTyped(doc: ProseNode, from: number, to: number): SpelledWord | null {
  if (from !== to) {
    return null;
  }
  const word = wordAround(doc, from);
  // The cursor at the start of a word is still on the boundary before it.
  if (!word || from <= word.from || from > word.to) {
    return null;
  }
  return word;
}

function overlaps(left: { from: number; to: number }, right: { from: number; to: number }): boolean {
  return left.from < right.to && left.to > right.from;
}

function wordsInserted(tr: Transaction, doc: ProseNode): SpelledWord[] {
  const words: SpelledWord[] = [];
  for (let index = 0; index < tr.steps.length; index += 1) {
    const step = tr.steps[index];
    if (!(step instanceof ReplaceStep) || step.slice.size === 0) {
      continue;
    }
    const later = tr.mapping.slice(index + 1);
    const from = later.map(step.from, 1);
    const to = later.map(step.from + step.slice.size, -1);
    if (from >= to) {
      continue;
    }
    doc.nodesBetween(from, to, (node, pos) => {
      if (!node.isText || !node.text) {
        return;
      }
      const start = Math.max(0, from - pos);
      const end = Math.min(node.text.length, to - pos);
      // A single character is the word the cursor is in. The caller already has that word.
      if (start >= end || end - start <= 1) {
        return false;
      }
      const slice = node.text.slice(start, end);
      for (const found of wordsIn(slice)) {
        const whole = wordAround(doc, pos + start + found.from);
        if (whole) {
          words.push(whole);
        }
      }
      return false;
    });
  }
  return words;
}

function finishedWords(
  tr: Transaction,
  before: EditorState,
  after: EditorState,
  open: SpelledWord | null,
): SpelledWord[] {
  const finished: SpelledWord[] = [];
  const left = wordBeingTyped(before.doc, before.selection.from, before.selection.to);
  for (const word of left ? mapWords([left], tr, after.doc) : []) {
    if (!open || !overlaps(word, open)) {
      finished.push(word);
    }
  }
  if (tr.docChanged) {
    for (const word of wordsInserted(tr, after.doc)) {
      if (open && overlaps(open, word)) {
        continue;
      }
      if (finished.some((item) => item.from === word.from && item.to === word.to)) {
        continue;
      }
      finished.push(word);
    }
  }
  return finished;
}

function mapWords(words: readonly SpelledWord[], tr: Transaction, doc: ProseNode): readonly SpelledWord[] {
  if (!tr.docChanged) {
    return words;
  }
  const next: SpelledWord[] = [];
  for (const word of words) {
    const from = tr.mapping.map(word.from, 1);
    const to = tr.mapping.map(word.to, -1);
    if (from >= to || doc.textBetween(from, to) !== word.text) {
      continue;
    }
    next.push({ from, to, text: word.text });
  }
  return next;
}

function dropWord(marks: DecorationSet, open: SpelledWord | null): DecorationSet {
  if (!open) {
    return marks;
  }
  const hit = marks
    .find(open.from, open.to)
    .filter((decoration) => decoration.from < open.to && decoration.to > open.from);
  return hit.length > 0 ? marks.remove(hit) : marks;
}

function pendingWords(
  words: readonly SpelledWord[],
  tr: Transaction,
  before: EditorState,
  after: EditorState,
  open: SpelledWord | null,
): SpelledWord[] {
  const pending = mapWords(words, tr, after.doc).filter((word) => !open || !overlaps(word, open));
  for (const word of finishedWords(tr, before, after, open)) {
    if (pending.some((item) => item.from === word.from && item.to === word.to)) {
      continue;
    }
    pending.push(word);
  }
  return pending;
}

function paint(marks: DecorationSet, doc: ProseNode, open: SpelledWord | null): DecorationSet {
  if (!open || open.from >= open.to) {
    return marks;
  }
  return marks.add(doc, [Decoration.inline(open.from, open.to, { spellcheck: "false" })]);
}

function misspellingSet(doc: ProseNode, ranges: readonly SpellingRange[]): DecorationSet {
  const decorations = ranges
    .filter((range) => range.from < range.to && range.to <= doc.content.size)
    .map((range) => Decoration.inline(range.from, range.to, { class: "misspelled" }))
    .sort((left, right) => left.from - right.from || left.to - right.to);
  return decorations.length > 0 ? DecorationSet.create(doc, decorations) : DecorationSet.empty;
}

function mergeChecked(
  marks: DecorationSet,
  doc: ProseNode,
  words: readonly SpelledWord[],
  ranges: readonly SpellingRange[],
): DecorationSet {
  let next = marks;
  for (const word of words) {
    const hit = next.find(word.from, word.to);
    if (hit.length > 0) {
      next = next.remove(hit);
    }
  }
  const additions = ranges
    .filter(
      (range) =>
        range.from < range.to &&
        range.to <= doc.content.size &&
        words.some((word) => range.from >= word.from && range.to <= word.to),
    )
    .map((range) => Decoration.inline(range.from, range.to, { class: "misspelled" }))
    .sort((left, right) => left.from - right.from || left.to - right.to);
  return additions.length > 0 ? next.add(doc, additions) : next;
}

function wordChunks(words: readonly SpelledWord[]): { joined: string; chunks: TextChunk[] } {
  let joined = "";
  const chunks: TextChunk[] = [];
  for (const word of words) {
    if (joined.length > 0) {
      joined += "\n";
    }
    chunks.push({ pos: word.from, start: joined.length, text: word.text });
    joined += word.text;
  }
  return { joined, chunks };
}

type SpellJob = { scene: true; doc: ProseNode } | { scene: false; words: string };

function spellJob(spelling: SpellingState, doc: ProseNode): SpellJob {
  if (spelling.scene) {
    return { scene: true, doc };
  }
  return { scene: false, words: spelling.words.map((word) => `${word.from}:${word.to}:${word.text}`).join("|") };
}

function sameJob(left: SpellJob, right: SpellJob): boolean {
  if (left.scene && right.scene) {
    return left.doc === right.doc;
  }
  if (!left.scene && !right.scene) {
    return left.words === right.words;
  }
  return false;
}

export function spellingMarksPlugin(): Plugin<SpellingState> {
  return new Plugin<SpellingState>({
    key: spellingMarksKey,
    state: {
      init(_config, state) {
        const open = wordBeingTyped(state.doc, state.selection.from, state.selection.to);
        const marks = DecorationSet.empty;
        return { marks, shown: paint(marks, state.doc, open), scene: true, words: [] };
      },
      apply(tr, value, oldState, newState) {
        const open = wordBeingTyped(newState.doc, newState.selection.from, newState.selection.to);
        const incoming = tr.getMeta(spellingMarksKey);
        if (incoming instanceof DecorationSet) {
          const marks = dropWord(incoming, open);
          return { marks, shown: paint(marks, newState.doc, open), scene: false, words: [] };
        }
        const dictionaryChanged = tr.getMeta(dictionarySpellcheckKey) !== undefined;
        if (!tr.docChanged && !tr.selectionSet && !dictionaryChanged) {
          return value;
        }
        let marks = tr.docChanged ? value.marks.map(tr.mapping, newState.doc) : value.marks;
        if (dictionaryChanged && marks !== DecorationSet.empty) {
          const known = dictionarySpellcheckKey.getState(newState)?.known;
          if (known && known.size > 0) {
            marks = withoutKnownMarks(newState.doc, marks, known);
          }
        }
        marks = dropWord(marks, open);
        const words = value.scene ? value.words : pendingWords(value.words, tr, oldState, newState, open);
        const shown = paint(marks, newState.doc, open);
        if (marks === value.marks && shown === value.shown && words === value.words) {
          return value;
        }
        return { marks, shown, scene: value.scene, words };
      },
    },
    props: {
      decorations(state) {
        return spellingMarksKey.getState(state)?.shown ?? DecorationSet.empty;
      },
    },
    view(editorView) {
      let timer = 0;
      let generation = 0;
      let reported = false;
      let armed: SpellJob | null = null;

      const deliver = (
        view: EditorView,
        gen: number,
        text: { joined: string; chunks: TextChunk[] },
        marksFor: (ranges: SpellingRange[]) => DecorationSet | null,
      ) => {
        void requestMisspellings(text.joined)
          .then((ranges) => {
            if (gen !== generation || view.isDestroyed) {
              return;
            }
            const known = dictionarySpellcheckKey.getState(view.state)?.known ?? new Set<string>();
            const marks = marksFor(rangesInChunks(text.chunks, ranges, known));
            if (!marks) {
              return;
            }
            reported = false;
            view.dispatch(view.state.tr.setMeta(spellingMarksKey, marks).setMeta("addToHistory", false));
          })
          .catch((error: unknown) => {
            if (gen !== generation || view.isDestroyed) {
              return;
            }
            if (!reported) {
              reported = true;
              reportFailure(error, "Spelling could not be checked.");
            }
            armed = null;
          });
      };

      const sync = (view: EditorView) => {
        const spelling = spellingMarksKey.getState(view.state);
        if (!spelling) {
          return;
        }
        const next = spellJob(spelling, view.state.doc);
        if (armed && sameJob(armed, next)) {
          return;
        }
        armed = next;
        window.clearTimeout(timer);
        const gen = ++generation;
        if (!next.scene && next.words === "") {
          return;
        }
        timer = window.setTimeout(() => {
          if (gen !== generation || view.isDestroyed) {
            return;
          }
          const current = spellingMarksKey.getState(view.state);
          if (!current) {
            return;
          }
          if (next.scene) {
            if (!current.scene) {
              return;
            }
            const text = spellingText(view.state.doc);
            deliver(view, gen, text, (ranges) => misspellingSet(view.state.doc, ranges));
            return;
          }
          const waiting = current.words;
          if (waiting.length === 0) {
            return;
          }
          deliver(view, gen, wordChunks(waiting), (ranges) => {
            const live = spellingMarksKey.getState(view.state);
            if (!live || live.scene) {
              return null;
            }
            return mergeChecked(live.marks, view.state.doc, waiting, ranges);
          });
        }, spellDelay);
      };

      sync(editorView);
      return {
        update(view) {
          sync(view);
        },
        destroy() {
          window.clearTimeout(timer);
          generation += 1;
        },
      };
    },
  });
}

export function spellingAwaiting(state: EditorState): "scene" | string[] {
  const spelling = spellingMarksKey.getState(state);
  if (!spelling) {
    return [];
  }
  if (spelling.scene) {
    return "scene";
  }
  return spelling.words.map((word) => word.text);
}

export function misspelledIn(state: EditorState): string[] {
  const marks = spellingMarksKey.getState(state)?.marks;
  if (!marks) {
    return [];
  }
  return marks.find().map((decoration) => state.doc.textBetween(decoration.from, decoration.to));
}

export function applySpellMarks(state: EditorState, marks: DecorationSet): EditorState {
  return state.apply(state.tr.setMeta(spellingMarksKey, marks).setMeta("addToHistory", false));
}

function requestMisspellings(text: string): Promise<SpellingRange[]> {
  if (!text) {
    return Promise.resolve([]);
  }
  return import("./storage.ts").then((storage) => storage.misspellings(text));
}

export function wordFromPoint(
  view: EditorView,
  x: number,
  y: number,
): { word: string; from: number; to: number } | null {
  const found = view.posAtCoords({ left: x, top: y });
  if (!found) {
    return null;
  }
  const resolved = view.state.doc.resolve(found.pos);
  const text = resolved.parent.textBetween(0, resolved.parent.content.size, "\n", "\0");
  const index = Math.max(0, Math.min(found.pos - resolved.start(), text.length));
  const word = wordAt(text, index);
  if (!word) {
    return null;
  }
  return { word: word.word, from: resolved.start() + word.from, to: resolved.start() + word.to };
}

const spellcheckReset = new WeakMap<EditorView, number>();

// Find highlights split the scene into spans. After those spans are gone the
// browser keeps checking that split text, so reset spellcheck once.
export function releaseBrowserSpellcheck(view: EditorView): void {
  const dom = view.dom;
  if (!dom.isContentEditable || !dom.spellcheck) {
    return;
  }
  dom.spellcheck = false;
  const previous = spellcheckReset.get(view);
  if (previous !== undefined) {
    cancelAnimationFrame(previous);
  }
  spellcheckReset.set(
    view,
    requestAnimationFrame(() => {
      spellcheckReset.delete(view);
      if (!view.isDestroyed) {
        dom.spellcheck = true;
      }
    }),
  );
}

export function isMisspelled(view: EditorView, from: number, to: number): boolean {
  const marks = spellingMarksKey.getState(view.state)?.marks;
  if (!marks?.find(from, to).some((range) => range.from < to && range.to > from)) {
    return false;
  }
  const known = dictionarySpellcheckKey.getState(view.state)?.known;
  if (!known) {
    return true;
  }
  return !known.has(view.state.doc.textBetween(from, to).toLocaleLowerCase());
}

export function suggestionCase(suggestion: string, original: string): string {
  if (original.length > 1 && original === original.toLocaleUpperCase()) {
    return suggestion.toLocaleUpperCase();
  }
  const first = original.charAt(0);
  if (first && first !== first.toLocaleLowerCase()) {
    return suggestion.charAt(0).toLocaleUpperCase() + suggestion.slice(1);
  }
  return suggestion;
}
