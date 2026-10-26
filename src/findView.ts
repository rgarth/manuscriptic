import { Extension } from "@tiptap/core";
import type { Node as ProseNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { hitsInNode } from "./find.ts";

export type FindQuery = {
  query: string;
  matchCase: boolean;
  from: number | null;
  to: number | null;
};

export type FindEditorState = FindQuery & {
  reveal: number;
};

type FindPluginState = FindQuery & {
  decorations: DecorationSet;
};

export const findMarksKey = new PluginKey<FindPluginState>("find-marks");

export const findMarks = Extension.create({
  name: "findMarks",
  addProseMirrorPlugins() {
    return [findMarksPlugin()];
  },
});

export function findMarksPlugin(): Plugin<FindPluginState> {
  return new Plugin<FindPluginState>({
    key: findMarksKey,
    state: {
      init() {
        return {
          query: "",
          matchCase: false,
          from: null,
          to: null,
          decorations: DecorationSet.empty,
        };
      },
      apply(tr, value, _old, state) {
        const incoming = findQuery(tr.getMeta(findMarksKey));
        const next = incoming ?? value;
        if (!tr.docChanged && !incoming) {
          return value;
        }
        return { ...next, decorations: highlight(state.doc, next) };
      },
    },
    props: {
      decorations(state) {
        return findMarksKey.getState(state)?.decorations ?? DecorationSet.empty;
      },
    },
  });
}

function highlight(doc: ProseNode, query: FindQuery): DecorationSet {
  if (!query.query) {
    return DecorationSet.empty;
  }
  const decorations = hitsInNode(doc, query.query, query.matchCase).map((hit) =>
    Decoration.inline(hit.from, hit.to, {
      class: hit.from === query.from && hit.to === query.to ? "find-hit current" : "find-hit",
    }),
  );
  return DecorationSet.create(doc, decorations);
}

function findQuery(value: unknown): FindQuery | null {
  if (!isRecord(value) || typeof value.query !== "string" || typeof value.matchCase !== "boolean") {
    return null;
  }
  if (!isPosition(value.from) || !isPosition(value.to)) {
    return null;
  }
  return {
    query: value.query,
    matchCase: value.matchCase,
    from: value.from,
    to: value.to,
  };
}

function isPosition(value: unknown): value is number | null {
  return value === null || typeof value === "number";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
