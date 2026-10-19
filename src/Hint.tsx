import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { hintAnchor, type HintAnchor } from "./tooltip.ts";

type HintProps = {
  label: string;
  children: ReactNode;
};

export default function Hint({ label, children }: HintProps) {
  const [visible, setVisible] = useState(false);
  const [anchor, setAnchor] = useState<HintAnchor | null>(null);
  const host = useRef<HTMLSpanElement>(null);
  const timer = useRef<number | null>(null);

  function show() {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
    }
    timer.current = window.setTimeout(() => setVisible(true), 400);
  }

  function hide() {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    setVisible(false);
  }

  useLayoutEffect(() => {
    if (!visible || !host.current) {
      setAnchor(null);
      return;
    }
    const rect = host.current.getBoundingClientRect();
    const next = hintAnchor(rect);
    setAnchor((current) =>
      current && current.x === next.x && current.y === next.y && current.place === next.place
        ? current
        : next,
    );
  });

  return (
    <span
      ref={host}
      className="hint-host"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {anchor ? (
        <span
          className={`hint ${anchor.place}`}
          role="tooltip"
          style={{ left: anchor.x, top: anchor.y }}
        >
          {label}
        </span>
      ) : null}
    </span>
  );
}
