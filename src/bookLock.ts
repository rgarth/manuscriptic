const holderKey = "manuscriptic-lock-holder";

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
