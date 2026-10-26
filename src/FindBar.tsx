import { useLayoutEffect, useRef, type KeyboardEvent } from "react";
import type { FindScope } from "./find.ts";
import Icon from "./icons";

export type FindBarProps = {
  query: string;
  replacement: string;
  replace: boolean;
  scope: FindScope;
  matchCase: boolean;
  status: string;
  canReplace: boolean;
  focusToken: number;
  onQuery: (value: string) => void;
  onReplacement: (value: string) => void;
  onToggleReplace: () => void;
  onScope: (scope: FindScope) => void;
  onMatchCase: (value: boolean) => void;
  onPrevious: () => void;
  onNext: () => void;
  onReplace: () => void;
  onReplaceAll: () => void;
  onClose: () => void;
};

export default function FindBar({
  query,
  replacement,
  replace,
  scope,
  matchCase,
  status,
  canReplace,
  focusToken,
  onQuery,
  onReplacement,
  onToggleReplace,
  onScope,
  onMatchCase,
  onPrevious,
  onNext,
  onReplace,
  onReplaceAll,
  onClose,
}: FindBarProps) {
  const field = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    field.current?.focus();
    field.current?.select();
  }, [focusToken]);

  function onFindKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") {
      return;
    }
    event.preventDefault();
    if (event.shiftKey) {
      onPrevious();
      return;
    }
    onNext();
  }

  function onReplaceKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") {
      return;
    }
    event.preventDefault();
    onReplace();
  }

  return (
    <div className="find-bar" role="search" aria-label="Find">
      <div className="find-row">
        <button
          type="button"
          className="mark find-expand"
          aria-expanded={replace}
          aria-label={replace ? "Hide replace" : "Show replace"}
          onClick={onToggleReplace}
        >
          <Icon name="chevron" />
        </button>
        <input
          ref={field}
          aria-label="Find"
          placeholder="Find"
          value={query}
          spellCheck={false}
          onChange={(event) => onQuery(event.currentTarget.value)}
          onKeyDown={onFindKey}
        />
        <button
          type="button"
          className="mark find-case"
          aria-pressed={matchCase}
          aria-label="Match case"
          onClick={() => onMatchCase(!matchCase)}
        >
          Aa
        </button>
        <span className="find-count" title={status} aria-live="polite">
          {status}
        </span>
        <button type="button" className="mark" aria-label="Previous match" onClick={onPrevious}>
          ‹
        </button>
        <button type="button" className="mark" aria-label="Next match" onClick={onNext}>
          ›
        </button>
        <button type="button" className="mark" aria-label="Close find" onClick={onClose}>
          ×
        </button>
      </div>
      {replace ? (
        <div className="find-row find-replace">
          <input
            aria-label="Replace"
            placeholder="Replace"
            value={replacement}
            spellCheck={false}
            onChange={(event) => onReplacement(event.currentTarget.value)}
            onKeyDown={onReplaceKey}
          />
          <button type="button" className="find-action" disabled={!canReplace} onClick={onReplace}>
            Replace
          </button>
          <button
            type="button"
            className="find-action"
            aria-label="Replace all"
            disabled={!canReplace}
            onClick={onReplaceAll}
          >
            All
          </button>
        </div>
      ) : null}
      <div className="segmented" role="group" aria-label="Find in">
        <button type="button" aria-pressed={scope === "document"} onClick={() => onScope("document")}>
          This document
        </button>
        <button type="button" aria-pressed={scope === "book"} onClick={() => onScope("book")}>
          All documents
        </button>
      </div>
    </div>
  );
}
