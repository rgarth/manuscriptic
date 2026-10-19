import { ask } from "@tauri-apps/plugin-dialog";
import { useEffect, useRef } from "react";
import { lockHolder, lockQuestion } from "./bookLock";
import { claimBookLock, refreshBookLock, releaseBookLock, takeBookLock } from "./storage";
import { tauriAvailable } from "./windows";

const heldElsewhere = "This book is open somewhere else. This window did not save.";

type LockVisit = "held" | "lost" | "asking" | "asked";

type BookLockActions = {
  showNotice: (error: unknown, fallback?: string) => void;
  currentPath: () => string | null;
  reload: (path: string) => Promise<void>;
  drop: () => void;
  cancelSave: () => void;
  setSaved: () => void;
  setSaveError: (message: string) => void;
};

export function useBookLock(path: string | null, actions: BookLockActions) {
  const holderId = useRef(lockHolder(sessionStorage));
  const pathRef = useRef(path);
  pathRef.current = path;
  const visit = useRef<LockVisit>("held");
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  async function ensure(bookPath: string): Promise<boolean> {
    if (!tauriAvailable()) {
      return true;
    }
    const state = await claimBookLock(bookPath, holderId.current);
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
    await takeBookLock(bookPath, holderId.current);
    return true;
  }

  async function resume(bookPath: string) {
    if (visit.current === "asking") {
      return;
    }
    visit.current = "asking";
    try {
      const took = await ensure(bookPath);
      const current = actionsRef.current;
      if (current.currentPath() !== bookPath) {
        return;
      }
      if (!took) {
        visit.current = "held";
        current.drop();
        return;
      }
      await current.reload(bookPath);
      visit.current = "held";
      current.setSaved();
      current.showNotice(null);
    } catch (error: unknown) {
      visit.current = "asked";
      actionsRef.current.showNotice(error, "Could not reload the saved book.");
    } finally {
      if (visit.current === "asking") {
        visit.current = "asked";
      }
    }
  }

  async function noteLost(bookPath: string) {
    if (visit.current !== "held" || actionsRef.current.currentPath() !== bookPath) {
      return;
    }
    visit.current = "lost";
    const current = actionsRef.current;
    current.cancelSave();
    current.showNotice("This window no longer has the lock. It will not save.");
    if (document.hasFocus()) {
      await resume(bookPath);
    }
  }

  function onBlur() {
    if (visit.current === "asked") {
      visit.current = "lost";
    }
  }

  function onFocus() {
    const bookPath = pathRef.current;
    if (!bookPath || visit.current !== "lost") {
      return;
    }
    void resume(bookPath);
  }

  useEffect(() => {
    if (!path || !tauriAvailable()) {
      return;
    }
    const timer = window.setInterval(() => {
      void refreshBookLock(path, holderId.current)
        .then(async (ours) => {
          if (ours || visit.current !== "held") {
            return;
          }
          await noteLost(path);
        })
        .catch((error: unknown) => {
          actionsRef.current.showNotice(error, "Could not check the book lock.");
        });
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [path]);

  return {
    lost: () => visit.current !== "held",
    held() {
      visit.current = "held";
    },
    ensure,
    async release(bookPath: string) {
      if (!tauriAvailable()) {
        return;
      }
      await releaseBookLock(bookPath, holderId.current);
    },
    onBlur,
    onFocus,
    blockSave() {
      if (visit.current === "held") {
        return false;
      }
      actionsRef.current.setSaveError(heldElsewhere);
      return true;
    },
    async stillOurs(bookPath: string) {
      if (!tauriAvailable()) {
        return true;
      }
      const ours = await refreshBookLock(bookPath, holderId.current);
      if (ours) {
        return true;
      }
      void noteLost(bookPath);
      return false;
    },
  };
}
