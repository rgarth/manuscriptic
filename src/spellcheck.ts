import { Extension } from "@tiptap/core";
import type { Node as ProseNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { EditorView } from "@tiptap/pm/view";
import { wordAt, wordsIn } from "./dictionary.ts";
import { reportFailure } from "./failures.ts";

export const dictionarySpellcheckKey = new PluginKey<Set<string>>("project-dictionary");

const spellingMarksKey = new PluginKey<DecorationSet>("spelling-marks");

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

export function projectDictionaryPlugin(): Plugin<Set<string>> {
  return new Plugin<Set<string>>({
    key: dictionarySpellcheckKey,
    state: {
      init() {
        return new Set<string>();
      },
      apply(tr, value) {
        const next: unknown = tr.getMeta(dictionarySpellcheckKey);
        if (!Array.isArray(next)) {
          return value;
        }
        return new Set(
          next
            .filter((word): word is string => typeof word === "string")
            .map((word) => word.toLocaleLowerCase()),
        );
      },
    },
    props: {
      decorations(state) {
        const known = dictionarySpellcheckKey.getState(state);
        if (!known || known.size === 0) {
          return DecorationSet.empty;
        }
        const decorations: Decoration[] = [];
        state.doc.descendants((node, pos) => {
          if (!node.isText || !node.text) {
            return;
          }
          for (const found of wordsIn(node.text)) {
            if (!known.has(found.word.toLocaleLowerCase())) {
              continue;
            }
            decorations.push(
              Decoration.inline(pos + found.from, pos + found.to, { spellcheck: "false" }),
            );
          }
        });
        return DecorationSet.create(state.doc, decorations);
      },
    },
  });
}

function spellingMarksPlugin(): Plugin<DecorationSet> {
  return new Plugin<DecorationSet>({
    key: spellingMarksKey,
    state: {
      init() {
        return DecorationSet.empty;
      },
      apply(tr, value, _old, state) {
        const incoming: unknown = tr.getMeta(spellingMarksKey);
        if (incoming instanceof DecorationSet) {
          return incoming;
        }
        if (tr.docChanged) {
          return value.map(tr.mapping, state.doc);
        }
        return value;
      },
    },
    props: {
      decorations(state) {
        const marks = spellingMarksKey.getState(state) ?? DecorationSet.empty;
        const known = dictionarySpellcheckKey.getState(state);
        if (!known || known.size === 0) {
          return marks;
        }
        const kept = marks.find().filter((decoration) => {
          const word = state.doc.textBetween(decoration.from, decoration.to);
          return !known.has(word.toLocaleLowerCase());
        });
        return DecorationSet.create(state.doc, kept);
      },
    },
    view() {
      let timer = 0;
      let generation = 0;
      let pending = "";
      let reported = false;
      return {
        update(view) {
          const collected = spellingText(view.state.doc);
          if (collected.joined === pending) {
            return;
          }
          pending = collected.joined;
          window.clearTimeout(timer);
          const gen = ++generation;
          const joined = collected.joined;
          timer = window.setTimeout(() => {
            void requestMisspellings(joined)
              .then((ranges) => {
                reported = false;
                if (gen !== generation) {
                  return;
                }
                const current = spellingText(view.state.doc);
                if (current.joined !== joined) {
                  return;
                }
                const decorations = rangesInChunks(current.chunks, ranges, new Set()).map((range) =>
                  Decoration.inline(range.from, range.to, { class: "misspelled" }),
                );
                view.dispatch(
                  view.state.tr.setMeta(spellingMarksKey, DecorationSet.create(view.state.doc, decorations)),
                );
              })
              .catch((error: unknown) => {
                if (gen !== generation) {
                  return;
                }
                pending = "";
                if (reported) {
                  return;
                }
                reported = true;
                reportFailure(error, "Spelling could not be checked.");
              });
          }, 200);
        },
        destroy() {
          window.clearTimeout(timer);
          generation += 1;
        },
      };
    },
  });
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

export function isMisspelled(view: EditorView, from: number, to: number): boolean {
  const marks = spellingMarksKey.getState(view.state);
  if (!marks || !marks.find(from, to).some((range) => range.from < to && range.to > from)) {
    return false;
  }
  const known = dictionarySpellcheckKey.getState(view.state);
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
