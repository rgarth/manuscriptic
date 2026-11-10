import {
  availableFonts,
  bundledFontFallback,
  missingBookFonts,
  rewriteBookFonts,
  type FontRemapAsk,
  type FontReplacements,
} from "./bookFonts.ts";
import type { ProjectFile } from "./model/project.ts";

export type FontRemapPending = {
  ask: FontRemapAsk;
  resolve: (result: FontReplacements | null) => void;
};

type Notice = (error: unknown, fallback?: string) => void;

/** Owns missing-font settle + one abortable remap prompt. Call invalidate on open/drop. */
export function createFontRemap(options: {
  notice: Notice;
  currentPath: () => string | null;
  currentProject: () => ProjectFile | null;
  historySettled: () => boolean;
  applyProject: (project: ProjectFile) => void;
  setPending: (pending: FontRemapPending | null) => void;
}) {
  let ticket = 0;
  let pending: FontRemapPending | null = null;

  function abortAsk() {
    const open = pending;
    pending = null;
    options.setPending(null);
    open?.resolve(null);
  }

  function invalidate() {
    ticket += 1;
    abortAsk();
  }

  function askRemap(ask: FontRemapAsk): Promise<FontReplacements | null> {
    abortAsk();
    return new Promise((resolve) => {
      const finish = (result: FontReplacements | null) => {
        if (pending?.resolve === finish) {
          pending = null;
          options.setPending(null);
        }
        resolve(result);
      };
      pending = { ask, resolve: finish };
      options.setPending(pending);
    });
  }

  async function settle(path: string) {
    const mine = ticket;
    const open = options.currentProject();
    if (!open || options.currentPath() !== path || !options.historySettled()) {
      return;
    }
    let available: string[];
    try {
      available = await availableFonts({ refresh: true });
    } catch (error: unknown) {
      options.notice(error, "Could not list fonts.");
      available = bundledFontFallback();
    }
    if (ticket !== mine || options.currentPath() !== path) {
      return;
    }
    const missing = missingBookFonts(options.currentProject() ?? open, available);
    if (missing.length === 0) {
      return;
    }
    const picks = await askRemap({ missing, available });
    if (ticket !== mine || options.currentPath() !== path || !picks) {
      return;
    }
    const current = options.currentProject() ?? open;
    const rewritten = rewriteBookFonts(current, picks);
    if (rewritten === current || options.currentPath() !== path) {
      return;
    }
    options.applyProject(rewritten);
  }

  return { invalidate, settle };
}
