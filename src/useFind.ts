import { useEffect, useMemo, useRef, useState } from "react";
import { registerCommands } from "./commands.ts";
import {
  documentHits,
  documentsIn,
  hitsInProject,
  keptFindIndex,
  preferOpen,
  replaceAllInProject,
  sameFindHits,
  selectDocument,
  spliceDocumentHits,
  stepAfterReplace,
  type BookHit,
  type FindScope,
} from "./find.ts";
import type { FindBarProps } from "./FindBar.tsx";
import type { FindEditorState } from "./findView.ts";
import { findKey } from "./menuPlan.ts";
import { findNode, type ProjectFile } from "./model/project.ts";

const noHits: { from: number; to: number }[] = [];

type FindSession = {
  open: boolean;
  bar: FindBarProps;
  editor: FindEditorState;
};

export function useFind(
  project: ProjectFile,
  onProject: (update: (project: ProjectFile) => ProjectFile) => void,
  blocked: boolean,
): FindSession {
  const [open, setOpen] = useState(false);
  const [replace, setReplace] = useState(false);
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [scope, setScope] = useState<FindScope>("document");
  const [matchCase, setMatchCase] = useState(false);
  const [active, setActive] = useState(0);
  const [reveal, setReveal] = useState(0);
  const [focusToken, setFocusToken] = useState(0);
  const selectedId = project.view.selectedId;
  const [hits, setHits] = useState<BookHit[]>([]);
  const safeActive = hits.length === 0 ? 0 : Math.min(Math.max(active, 0), hits.length - 1);
  const activeHit = hits[safeActive] ?? null;
  const latest = useRef({
    open,
    query,
    replacement,
    scope,
    matchCase,
    selectedId,
    hits,
    safeActive,
    blocked,
    project,
    onProject,
  });
  latest.current = {
    open,
    query,
    replacement,
    scope,
    matchCase,
    selectedId,
    hits,
    safeActive,
    blocked,
    project,
    onProject,
  };
  function bump() {
    setReveal((value) => value + 1);
  }

  function place(nextHits: BookHit[]) {
    setHits(nextHits);
    setActive(preferOpen(nextHits, latest.current.selectedId));
    bump();
  }

  function openHit(hit: BookHit | null) {
    if (!hit || hit.documentId === latest.current.selectedId) {
      return;
    }
    latest.current.onProject((book) => selectDocument(book, hit.documentId));
  }

  function openFind(expand: boolean) {
    const current = latest.current;
    const inBar =
      document.activeElement instanceof HTMLElement && document.activeElement.closest(".find-bar") !== null;
    const seed = inBar ? "" : selectedLine();
    const nextQuery = seed || current.query;
    if (seed) {
      setQuery(seed);
    }
    if (expand) {
      setReplace(true);
    }
    place(hitsInProject(current.project, current.scope, current.selectedId, nextQuery, current.matchCase));
    setOpen(true);
    setFocusToken((value) => value + 1);
  }

  function freshHits(): BookHit[] {
    const current = latest.current;
    if (!current.query || !current.selectedId) {
      return current.hits;
    }
    const located = findNode(current.project, current.selectedId);
    if (!located || located.node.kind !== "document") {
      return current.hits;
    }
    const found = documentHits(
      current.selectedId,
      located.node.title,
      located.node.content,
      current.query,
      current.matchCase,
    );
    const order =
      current.scope === "document"
        ? [current.selectedId]
        : documentsIn(current.project, "book", current.selectedId).map((doc) => doc.id);
    const next = spliceDocumentHits(current.hits, current.selectedId, found, current.scope, order);
    if (!sameFindHits(current.hits, next)) {
      setHits(next);
    }
    return next;
  }

  function move(delta: number) {
    const current = latest.current;
    const hitsNow = freshHits();
    if (hitsNow.length === 0) {
      setOpen(true);
      setFocusToken((value) => value + 1);
      return;
    }
    const safe = Math.min(Math.max(current.safeActive, 0), hitsNow.length - 1);
    const index = sameFindHits(current.hits, hitsNow) ? safe : keptFindIndex(current.hits, hitsNow, safe);
    const hit = hitsNow[index];
    if (hit && hit.documentId !== current.selectedId && delta > 0) {
      setActive(index);
      setOpen(true);
      bump();
      openHit(hit);
      return;
    }
    const next = (index + delta + hitsNow.length) % hitsNow.length;
    setActive(next);
    setOpen(true);
    bump();
    openHit(hitsNow[next] ?? null);
  }

  function findNext() {
    if (!latest.current.open) {
      const hitsNow = freshHits();
      const index = keptFindIndex(latest.current.hits, hitsNow, latest.current.safeActive);
      setActive(index);
      setOpen(true);
      setFocusToken((value) => value + 1);
      bump();
      openHit(hitsNow[index] ?? null);
      return;
    }
    move(1);
  }

  function replaceCurrent() {
    const current = latest.current;
    if (!current.query) {
      return;
    }
    const hitsNow = freshHits();
    const index = keptFindIndex(current.hits, hitsNow, current.safeActive);
    const hit = hitsNow[index];
    if (!hit) {
      setActive(0);
      return;
    }
    const moved: { step: NonNullable<ReturnType<typeof stepAfterReplace>> | null } = { step: null };
    current.onProject((book) => {
      const next = stepAfterReplace(
        book,
        hitsNow,
        hit,
        current.replacement,
        current.query,
        current.matchCase,
        current.scope,
      );
      moved.step = next;
      return next?.project ?? book;
    });
    const step = moved.step;
    if (!step) {
      return;
    }
    setHits(step.hits);
    if (step.index < 0) {
      setActive(0);
      return;
    }
    setActive(step.index);
    bump();
    openHit(step.hit);
  }

  function replaceEvery() {
    const current = latest.current;
    if (!current.query || current.hits.length === 0) {
      return;
    }
    const replaced: { project: ProjectFile } = { project: current.project };
    current.onProject((book) => {
      const next = replaceAllInProject(
        book,
        current.scope,
        book.view.selectedId,
        current.query,
        current.replacement,
        current.matchCase,
      );
      replaced.project = next.project;
      return next.project;
    });
    setHits(hitsInProject(replaced.project, current.scope, current.selectedId, current.query, current.matchCase));
    setActive(0);
  }

  useEffect(() => {
    return registerCommands({
      find: () => openFind(false),
      findNext,
      findPrevious: () => move(-1),
      replace: () => openFind(true),
    });
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (latest.current.blocked) {
        return;
      }
      const command = event.metaKey || event.ctrlKey;
      if (!command && event.key === "Escape") {
        if (!latest.current.open) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        return;
      }
      const found = findKey({
        key: event.key,
        ctrl: event.ctrlKey,
        meta: event.metaKey,
        shift: event.shiftKey,
        alt: event.altKey,
      });
      if (!found) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      switch (found) {
        case "find":
        case "replace":
          if (!event.repeat) {
            openFind(found === "replace");
          }
          return;
        case "find-previous":
          move(-1);
          return;
        case "find-next":
          findNext();
          return;
        default: {
          const unexpected: never = found;
          return unexpected;
        }
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  const shown = open && activeHit?.documentId === selectedId ? activeHit : null;
  const sceneHits = useMemo(() => {
    if (!open) {
      return noHits;
    }
    const ranges: { from: number; to: number }[] = [];
    for (const hit of hits) {
      if (hit.documentId === selectedId) {
        ranges.push({ from: hit.from, to: hit.to });
      }
    }
    return ranges;
  }, [open, hits, selectedId]);
  const documentOpen = documentsIn(project, "document", selectedId).length > 0;
  return {
    open,
    bar: {
      query,
      replacement,
      replace,
      scope,
      matchCase,
      status: statusLabel(query, hits, safeActive, scope, documentOpen),
      canReplace: query.length > 0 && hits.length > 0,
      focusToken,
      onQuery: (value) => {
        setQuery(value);
        place(hitsInProject(project, scope, selectedId, value, matchCase));
      },
      onReplacement: setReplacement,
      onToggleReplace: () => setReplace((value) => !value),
      onScope: (next) => {
        setScope(next);
        place(hitsInProject(project, next, selectedId, query, matchCase));
      },
      onMatchCase: (next) => {
        setMatchCase(next);
        place(hitsInProject(project, scope, selectedId, query, next));
      },
      onPrevious: () => move(-1),
      onNext: () => move(1),
      onReplace: replaceCurrent,
      onReplaceAll: replaceEvery,
      onClose: () => setOpen(false),
    },
    editor: {
      query: open ? query : "",
      matchCase,
      from: shown ? shown.from : null,
      to: shown ? shown.to : null,
      hits: sceneHits,
      reveal: open ? reveal : 0,
    },
  };
}

function statusLabel(
  query: string,
  hits: BookHit[],
  active: number,
  scope: FindScope,
  documentOpen: boolean,
): string {
  if (!query) {
    return "";
  }
  if (hits.length === 0) {
    if (scope === "document" && !documentOpen) {
      return "No document open";
    }
    return "No matches";
  }
  const hit = hits[active];
  const count = `${active + 1} of ${hits.length}`;
  return scope === "book" ? `${count} in ${hit.title}` : count;
}

function selectedLine(): string {
  const text = window.getSelection()?.toString() ?? "";
  if (!text || text.includes("\n") || text.length > 200) {
    return "";
  }
  return text;
}
