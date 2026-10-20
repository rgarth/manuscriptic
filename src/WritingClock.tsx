import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "./icons";
import type { EditorDoc } from "./model/editorDoc";
import {
  formatSessionWords,
  formatWritingTime,
  openClock,
  readWritingDay,
  tickClock,
  writeWritingDay,
  writingIdleMinutes,
  writingNow,
  type OpenClock,
} from "./writingTime";

type WritingClockProps = {
  bookKey: string | null;
  sceneId: string | null;
  content: EditorDoc | null;
  manuscriptWords: number;
};

type SeenPage = {
  bookKey: string | null;
  sceneId: string | null;
  content: EditorDoc | null;
};

type ClockSession = {
  bookKey: string | null;
  clock: OpenClock;
  active: boolean;
};

export default function WritingClock({ bookKey, sceneId, content, manuscriptWords }: WritingClockProps) {
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState<ClockSession | null>(null);
  const seen = useRef<SeenPage | null>(null);
  const focusedRef = useRef(document.hasFocus());
  const lastEditRef = useRef<number | null>(null);
  const bookKeyRef = useRef(bookKey);
  const wordsAtOpen = useRef<{ key: string | null; words: number } | null>(null);
  const host = useRef<HTMLSpanElement>(null);
  bookKeyRef.current = bookKey;

  if (!wordsAtOpen.current || wordsAtOpen.current.key !== bookKey) {
    wordsAtOpen.current = { key: bookKey, words: manuscriptWords };
  }
  const sessionWords = manuscriptWords - wordsAtOpen.current.words;

  const sync = useCallback((opened: OpenClock | null) => {
    const now = Date.now();
    const key = bookKeyRef.current;
    const active = writingNow(now, focusedRef.current, lastEditRef.current);
    setSession((current) => {
      const base = opened ?? (current?.bookKey === key ? current.clock : null);
      if (!base) {
        return current;
      }
      const clock = tickClock(base, now, active);
      if (
        current &&
        current.bookKey === key &&
        current.active === active &&
        current.clock.sessionSeconds === clock.sessionSeconds &&
        current.clock.runningSince === clock.runningSince &&
        current.clock.today.day === clock.today.day &&
        current.clock.today.seconds === clock.today.seconds
      ) {
        return current;
      }
      return { bookKey: key, clock, active };
    });
  }, []);

  useEffect(() => {
    const previous = seen.current;
    if (!previous || previous.bookKey !== bookKey) {
      lastEditRef.current = null;
      sync(openClock(bookKey ? readWritingDay(localStorage, bookKey) : null, Date.now()));
    } else if (previous.sceneId === sceneId && previous.content !== content) {
      lastEditRef.current = Date.now();
      sync(null);
    }
    seen.current = { bookKey, sceneId, content };
  }, [bookKey, sceneId, content, sync]);

  useEffect(() => {
    function onFocus() {
      focusedRef.current = true;
      sync(null);
    }
    function onBlur() {
      focusedRef.current = false;
      sync(null);
    }
    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
    };
  }, [sync]);

  useEffect(() => {
    const id = window.setInterval(() => sync(null), 1000);
    return () => window.clearInterval(id);
  }, [sync]);

  useEffect(() => {
    if (!bookKey || !session || session.bookKey !== bookKey) {
      return;
    }
    writeWritingDay(localStorage, bookKey, session.clock.today);
  }, [bookKey, session]);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onPointer(event: PointerEvent) {
      if (!host.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    window.addEventListener("pointerdown", onPointer);
    return () => window.removeEventListener("pointerdown", onPointer);
  }, [open]);

  const active = session?.active ?? false;
  const sessionLabel = formatWritingTime(session?.clock.sessionSeconds ?? 0);
  const todayLabel = formatWritingTime(session?.clock.today.seconds ?? 0);

  return (
    <span className="status-clock" ref={host}>
      <button
        type="button"
        className="status-button"
        aria-expanded={open}
        aria-label={`Writing ${sessionLabel}, today ${todayLabel}`}
        onClick={() => setOpen((value) => !value)}
      >
        <Icon name={active ? "clock" : "pause"} />
        {sessionLabel}
      </button>
      {open ? (
        <div className="clock-card" role="dialog" aria-label="Writing time">
          <p>{active ? "Writing" : "Paused"}</p>
          <p>
            This sitting · {sessionLabel} · {formatSessionWords(sessionWords)}
          </p>
          <p>Today · {todayLabel}</p>
          <p className="clock-note">
            Counts while this window is in front and the page has changed in the last {writingIdleMinutes}{" "}
            minutes.
          </p>
        </div>
      ) : null}
    </span>
  );
}
