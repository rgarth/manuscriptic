import { useEffect, useMemo, useRef, useState } from "react";
import { registerCommands } from "./commands.ts";
import {
  documentsIn,
  hitsInProject,
  preferOpen,
  replaceAllInProject,
  selectDocument,
  stepAfterReplace,
  type BookHit,
  type FindScope,
} from "./find.ts";
import type { FindBarProps } from "./FindBar.tsx";
import type { FindEditorState } from "./findView.ts";
import { findKey } from "./menuPlan.ts";
import type { ProjectFile } from "./model/project.ts";

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
  const hits = useMemo(
    () => hitsInProject(project, scope, selectedId, query, matchCase),
    [project, scope, selectedId, query, matchCase],
  );
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
    const nextHits = hitsInProject(
      current.project,
      current.scope,
      current.selectedId,
      nextQuery,
      current.matchCase,
    );
    setActive(preferOpen(nextHits, current.selectedId));
    setOpen(true);
    setFocusToken((value) => value + 1);
    bump();
  }

  function move(delta: number) {
    const current = latest.current;
    if (current.hits.length === 0) {
      setOpen(true);
      setFocusToken((value) => value + 1);
      return;
    }
    const hit = current.hits[current.safeActive];
    if (hit && hit.documentId !== current.selectedId && delta > 0) {
      setOpen(true);
      bump();
      openHit(hit);
      return;
    }
    const next = (current.safeActive + delta + current.hits.length) % current.hits.length;
    setActive(next);
    setOpen(true);
    bump();
    openHit(current.hits[next] ?? null);
  }

  function findNext() {
    if (!latest.current.open) {
      setOpen(true);
      setFocusToken((value) => value + 1);
      bump();
      openHit(latest.current.hits[latest.current.safeActive] ?? null);
      return;
    }
    move(1);
  }

  function replaceCurrent() {
    const current = latest.current;
    const hit = current.hits[current.safeActive];
    if (!hit || !current.query) {
      return;
    }
    const moved: { step: NonNullable<ReturnType<typeof stepAfterReplace>> | null } = { step: null };
    current.onProject((book) => {
      const next = stepAfterReplace(book, hit, current.replacement, current.query, current.matchCase, current.scope);
      moved.step = next;
      return next?.project ?? book;
    });
    const step = moved.step;
    if (!step) {
      return;
    }
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
    current.onProject((book) => {
      const replaced = replaceAllInProject(
        book,
        current.scope,
        book.view.selectedId,
        current.query,
        current.replacement,
        current.matchCase,
      );
      return replaced.project;
    });
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
