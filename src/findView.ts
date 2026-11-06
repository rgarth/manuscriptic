import type { EditorView } from "@tiptap/pm/view";

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

const matchesName = "find-match";
const currentName = "find-current";

export function clearFindHighlights(): void {
  const registry = highlightRegistry();
  if (!registry) {
    return;
  }
  registry.delete(matchesName);
  registry.delete(currentName);
}

/** Paint matches the way the browser paints a selection: no extra elements in the text. */
export function paintFindHighlights(
  view: EditorView,
  hits: readonly { from: number; to: number }[],
  from: number | null,
  to: number | null,
): void {
  const registry = highlightRegistry();
  if (!registry) {
    return;
  }
  registry.delete(matchesName);
  registry.delete(currentName);
  if (view.isDestroyed || hits.length === 0) {
    return;
  }
  const matches = new Highlight();
  const current = new Highlight();
  const max = view.state.doc.content.size;
  for (const hit of hits) {
    if (hit.from < 0 || hit.to > max || hit.from >= hit.to) {
      continue;
    }
    const range = textRange(view, hit.from, hit.to);
    if (!range) {
      continue;
    }
    if (hit.from === from && hit.to === to) {
      current.add(range);
    } else {
      matches.add(range);
    }
  }
  if (matches.size > 0) {
    registry.set(matchesName, matches);
  }
  if (current.size > 0) {
    registry.set(currentName, current);
  }
}

function highlightRegistry(): HighlightRegistry | null {
  if (typeof CSS === "undefined" || !("highlights" in CSS)) {
    return null;
  }
  return CSS.highlights;
}

function textRange(view: EditorView, from: number, to: number): Range | null {
  try {
    const start = view.domAtPos(from);
    const end = view.domAtPos(to);
    if (!start.node.isConnected || !end.node.isConnected) {
      return null;
    }
    const range = document.createRange();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
    return range;
  } catch {
    return null;
  }
}
