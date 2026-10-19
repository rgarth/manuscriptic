import { ask } from "@tauri-apps/plugin-dialog";
import { claimBookLock, refreshBookLock, releaseBookLock, takeBookLock } from "./storage.ts";
import { tauriAvailable } from "./windows.ts";

const holderKey = "manuscriptic-lock-holder";
export const heldElsewhere = "This book is open somewhere else. This window did not save.";

export function lockHolder(storage: Pick<Storage, "getItem" | "setItem">): string {
  const existing = storage.getItem(holderKey);
  if (existing) {
    return existing;
  }
  const created = crypto.randomUUID();
  storage.setItem(holderKey, created);
  return created;
}

export type BookLock =
  | { state: "free" }
  | { state: "ours" }
  | { state: "held"; computer: string; since: number };

export type LockVisit = "held" | "lost" | "asking" | "asked";

export type VisitEvent =
  | { name: "lose" }
  | { name: "blur" }
  | { name: "focus"; path: string | null }
  | { name: "hold" }
  | { name: "resume" }
  | { name: "cancel" }
  | { name: "reloaded" }
  | { name: "failed" }
  | { name: "settle" };

export type VisitEffect = "none" | "stop" | "ask" | "drop" | "saved" | "failed";

export type VisitStep = { visit: LockVisit; effect: VisitEffect };

export function stepVisit(visit: LockVisit, event: VisitEvent): VisitStep {
  switch (event.name) {
    case "lose":
      return visit === "held" ? { visit: "lost", effect: "stop" } : { visit, effect: "none" };
    case "blur":
      return visit === "asked" ? { visit: "lost", effect: "none" } : { visit, effect: "none" };
    case "focus":
      return event.path !== null && visit === "lost"
        ? { visit: "asking", effect: "ask" }
        : { visit, effect: "none" };
    case "hold":
      return { visit: "held", effect: "none" };
    case "resume":
      return visit === "asking" ? { visit, effect: "none" } : { visit: "asking", effect: "ask" };
    case "cancel":
      return { visit: "held", effect: "drop" };
    case "reloaded":
      return { visit: "held", effect: "saved" };
    case "failed":
      return { visit: "asked", effect: "failed" };
    case "settle":
      return visit === "asking" ? { visit: "asked", effect: "none" } : { visit, effect: "none" };
    default: {
      const unexpected: never = event;
      return unexpected;
    }
  }
}

export function saveBlocked(visit: LockVisit): boolean {
  return visit !== "held";
}

type LockActions = {
  showNotice: (error: unknown, fallback?: string) => void;
  currentPath: () => string | null;
  reload: (path: string) => Promise<void>;
  drop: () => void;
  cancelSave: () => void;
  setSaved: () => void;
  setSaveError: (message: string) => void;
};

export function createBookLock(actions: LockActions) {
  const holderId = lockHolder(sessionStorage);
  let visit: LockVisit = "held";

  function apply(event: VisitEvent): VisitStep {
    const stepped = stepVisit(visit, event);
    visit = stepped.visit;
    return stepped;
  }

  async function ensure(bookPath: string): Promise<boolean> {
    if (!tauriAvailable()) {
      return true;
    }
    const state = await claimBookLock(bookPath, holderId);
    const question = lockQuestion(state, (since) => new Date(since).toLocaleString());
    if (!question) {
      return true;
    }
    const openAnyway = await ask(question, {
      title: "This book is open",
      kind: "warning",
      okLabel: "Open Anyway",
      cancelLabel: "Cancel",
    });
    if (!openAnyway) {
      return false;
    }
    await takeBookLock(bookPath, holderId);
    return true;
  }

  async function resumeFrom(bookPath: string) {
    try {
      const took = await ensure(bookPath);
      if (actions.currentPath() !== bookPath) {
        return;
      }
      if (!took) {
        if (apply({ name: "cancel" }).effect === "drop") {
          actions.drop();
        }
        return;
      }
      await actions.reload(bookPath);
      if (apply({ name: "reloaded" }).effect === "saved") {
        actions.setSaved();
        actions.showNotice(null);
      }
    } catch (error: unknown) {
      if (apply({ name: "failed" }).effect === "failed") {
        actions.showNotice(error, "Could not reload the saved book.");
      }
    } finally {
      apply({ name: "settle" });
    }
  }

  async function beginResume(bookPath: string) {
    if (apply({ name: "resume" }).effect === "ask") {
      await resumeFrom(bookPath);
    }
  }

  async function noteLost(bookPath: string) {
    if (actions.currentPath() !== bookPath) {
      return;
    }
    if (apply({ name: "lose" }).effect !== "stop") {
      return;
    }
    actions.cancelSave();
    actions.showNotice("This window no longer has the lock. It will not save.");
    if (document.hasFocus()) {
      await beginResume(bookPath);
    }
  }

  return {
    lost: () => saveBlocked(visit),
    held() {
      apply({ name: "hold" });
    },
    ensure,
    async release(bookPath: string) {
      if (!tauriAvailable()) {
        return;
      }
      await releaseBookLock(bookPath, holderId);
    },
    onBlur() {
      apply({ name: "blur" });
    },
    onFocus() {
      const path = actions.currentPath();
      if (apply({ name: "focus", path }).effect === "ask" && path) {
        void resumeFrom(path);
      }
    },
    blockSave() {
      if (!saveBlocked(visit)) {
        return false;
      }
      actions.setSaveError(heldElsewhere);
      return true;
    },
    async stillOurs(bookPath: string) {
      if (!tauriAvailable()) {
        return true;
      }
      const ours = await refreshBookLock(bookPath, holderId);
      if (ours) {
        return true;
      }
      void noteLost(bookPath);
      return false;
    },
    watch(path: string) {
      if (!tauriAvailable()) {
        return () => undefined;
      }
      const timer = window.setInterval(() => {
        void refreshBookLock(path, holderId)
          .then(async (ours) => {
            if (ours || saveBlocked(visit)) {
              return;
            }
            await noteLost(path);
          })
          .catch((error: unknown) => {
            actions.showNotice(error, "Could not check the book lock.");
          });
      }, 30_000);
      return () => window.clearInterval(timer);
    },
  };
}

export function lockQuestion(lock: BookLock, when: (since: number) => string): string | null {
  switch (lock.state) {
    case "free":
    case "ours":
      return null;
    case "held":
      return `This novel is open on ${lock.computer}, since ${when(lock.since)}. Opening it here takes the lock. A later save from that computer can overwrite this copy.`;
    default: {
      const unexpected: never = lock;
      return unexpected;
    }
  }
}
