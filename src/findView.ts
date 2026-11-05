import { Extension } from "@tiptap/core";
import type { Node as ProseNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
export type FindQuery = {
  query: string;
  matchCase: boolean;
  from: number | null;
  to: number | null;
  hits: { from: number; to: number }[];
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
          hits: [],
          decorations: DecorationSet.empty,
        };
      },
      apply(tr, value, _old, state) {
        const incoming = findQuery(tr.getMeta(findMarksKey));
        if (incoming) {
          return { ...incoming, decorations: highlight(state.doc, incoming) };
        }
        if (!tr.docChanged || !value.query) {
          return value;
        }
        return { ...value, decorations: value.decorations.map(tr.mapping, state.doc) };
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
  if (!query.query || query.hits.length === 0) {
    return DecorationSet.empty;
  }
  const max = doc.content.size;
  const decorations: Decoration[] = [];
  for (const hit of query.hits) {
    if (hit.from < 0 || hit.to > max || hit.from >= hit.to) {
      continue;
    }
    decorations.push(
      Decoration.inline(hit.from, hit.to, {
        class: hit.from === query.from && hit.to === query.to ? "find-hit current" : "find-hit",
      }),
    );
  }
  return decorations.length > 0 ? DecorationSet.create(doc, decorations) : DecorationSet.empty;
}

function findQuery(value: unknown): FindQuery | null {
  if (!isRecord(value) || typeof value.query !== "string" || typeof value.matchCase !== "boolean") {
    return null;
  }
  if (!isPosition(value.from) || !isPosition(value.to) || !Array.isArray(value.hits)) {
    return null;
  }
  const hits: { from: number; to: number }[] = [];
  for (const hit of value.hits) {
    if (!isRecord(hit) || typeof hit.from !== "number" || typeof hit.to !== "number") {
      return null;
    }
    hits.push({ from: hit.from, to: hit.to });
  }
  return {
    query: value.query,
    matchCase: value.matchCase,
    from: value.from,
    to: value.to,
    hits,
  };
}

function isPosition(value: unknown): value is number | null {
  return value === null || typeof value === "number";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
