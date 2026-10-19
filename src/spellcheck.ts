import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { EditorView } from "@tiptap/pm/view";
import { wordAt, wordsIn } from "./dictionary.ts";

export const dictionarySpellcheckKey = new PluginKey<Set<string>>("project-dictionary");

export const projectDictionary = Extension.create({
  name: "projectDictionary",
  addProseMirrorPlugins() {
    return [projectDictionaryPlugin()];
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

export function wordFromPoint(view: EditorView, x: number, y: number): string | null {
  const found = view.posAtCoords({ left: x, top: y });
  if (!found) {
    return null;
  }
  const resolved = view.state.doc.resolve(found.pos);
  const text = resolved.parent.textBetween(0, resolved.parent.content.size, "\n", "\0");
  const index = Math.max(0, Math.min(found.pos - resolved.start(), text.length));
  return wordAt(text, index)?.word ?? null;
}
