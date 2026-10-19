const listeners = new Set<(message: string) => void>();
const pending: string[] = [];

export function failureMessage(error: unknown, fallback: string): string {
  if (typeof error === "string" && error.trim()) {
    return error;
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return fallback;
}

export function reportFailure(error: unknown, fallback: string): void {
  const message = failureMessage(error, fallback);
  if (listeners.size === 0) {
    pending.push(message);
    return;
  }
  for (const listener of listeners) {
    listener(message);
  }
}

export function onFailure(listener: (message: string) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function takePendingFailures(): string[] {
  return pending.splice(0, pending.length);
}
