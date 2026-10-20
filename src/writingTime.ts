export const writingIdleMinutes = 5;

export const writingIdleMs = writingIdleMinutes * 60 * 1000;

const writingDaysKey = "manuscriptic-writing-days";

export type WritingRecord = {
  day: string;
  seconds: number;
};

export type OpenClock = {
  today: WritingRecord;
  sessionSeconds: number;
  runningSince: number | null;
};

type ClockStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export function localDay(at: number): string {
  const date = new Date(at);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function writingNow(now: number, focused: boolean, lastEditAt: number | null): boolean {
  return focused && lastEditAt !== null && now - lastEditAt < writingIdleMs;
}

export function openClock(stored: WritingRecord | null, now: number): OpenClock {
  const day = localDay(now);
  const today = stored && stored.day === day ? stored : { day, seconds: 0 };
  return { today, sessionSeconds: 0, runningSince: null };
}

export function tickClock(clock: OpenClock, now: number, active: boolean): OpenClock {
  const day = localDay(now);
  const sameDay = clock.today.day === day;
  let today = sameDay ? clock.today : { day, seconds: 0 };
  let sessionSeconds = sameDay ? clock.sessionSeconds : 0;
  let runningSince = sameDay ? clock.runningSince : null;
  if (runningSince !== null) {
    const elapsed = Math.max(0, Math.floor((now - runningSince) / 1000));
    if (elapsed > 0) {
      today = { day, seconds: today.seconds + elapsed };
      sessionSeconds += elapsed;
      runningSince += elapsed * 1000;
    }
  }
  if (!active) {
    return { today, sessionSeconds, runningSince: null };
  }
  return { today, sessionSeconds, runningSince: runningSince ?? now };
}

export function formatWritingTime(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  if (whole < 60) {
    return whole === 0 ? "0m" : `${whole}s`;
  }
  const minutes = Math.floor(whole / 60);
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

export function formatSessionWords(words: number): string {
  const count = Math.trunc(words);
  const amount = Math.abs(count).toLocaleString();
  const label = Math.abs(count) === 1 ? "word" : "words";
  if (count === 0) {
    return `0 ${label}`;
  }
  return `${count > 0 ? "+" : "−"}${amount} ${label}`;
}

export function readWritingDay(storage: ClockStorage, bookKey: string): WritingRecord | null {
  const raw = storage.getItem(writingDaysKey);
  if (!raw) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) {
    return null;
  }
  return writingRecord(parsed[bookKey]);
}

export function writeWritingDay(storage: ClockStorage, bookKey: string, record: WritingRecord): void {
  const raw = storage.getItem(writingDaysKey);
  let parsed: unknown = {};
  if (raw) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = {};
    }
  }
  const days = isRecord(parsed) ? { ...parsed } : {};
  days[bookKey] = { day: record.day, seconds: record.seconds };
  storage.setItem(writingDaysKey, JSON.stringify(days));
}

function writingRecord(value: unknown): WritingRecord | null {
  if (!isRecord(value) || typeof value.day !== "string" || typeof value.seconds !== "number") {
    return null;
  }
  if (!Number.isFinite(value.seconds)) {
    return null;
  }
  return { day: value.day, seconds: Math.max(0, Math.floor(value.seconds)) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
