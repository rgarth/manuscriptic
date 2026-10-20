import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatSessionWords,
  formatWritingTime,
  localDay,
  openClock,
  readWritingDay,
  tickClock,
  writeWritingDay,
  writingIdleMs,
  writingNow,
} from "./writingTime.ts";

test("time counts only while the window is in front and the page has just changed", () => {
  const now = 1_700_000_000_000;
  assert.equal(writingNow(now, true, now - 60_000), true);
  assert.equal(writingNow(now, true, now - writingIdleMs), false);
  assert.equal(writingNow(now, false, now), false);
  assert.equal(writingNow(now, true, null), false);
});

test("a ticking clock adds whole seconds once, and a pause keeps them", () => {
  const now = Date.now();
  let clock = tickClock(openClock(null, now), now, true);
  assert.equal(clock.sessionSeconds, 0);
  clock = tickClock(clock, now + 2500, true);
  assert.equal(clock.sessionSeconds, 2);
  assert.equal(clock.today.seconds, 2);
  clock = tickClock(clock, now + 2500, true);
  assert.equal(clock.sessionSeconds, 2);
  clock = tickClock(clock, now + 4000, false);
  assert.equal(clock.sessionSeconds, 4);
  assert.equal(clock.runningSince, null);
  clock = tickClock(clock, now + 9000, false);
  assert.equal(clock.sessionSeconds, 4);
});

test("a new day starts the count again", () => {
  const now = Date.now();
  const clock = openClock({ day: "1999-01-01", seconds: 40 }, now);
  assert.equal(clock.today.day, localDay(now));
  assert.equal(clock.today.seconds, 0);
  assert.equal(clock.sessionSeconds, 0);
});

test("writing time reads in hours and minutes, and words keep their sign", () => {
  assert.equal(formatWritingTime(0), "0m");
  assert.equal(formatWritingTime(12), "12s");
  assert.equal(formatWritingTime(60), "1m");
  assert.equal(formatWritingTime(3660), "1h 1m");
  assert.equal(formatWritingTime(7200), "2h");
  assert.equal(formatSessionWords(0), "0 words");
  assert.equal(formatSessionWords(1), "+1 word");
  assert.equal(formatSessionWords(-3), "−3 words");
});

test("today's writing time is kept for the book", () => {
  const storage = memoryStorage();
  assert.equal(readWritingDay(storage, "a.manuscriptic"), null);
  writeWritingDay(storage, "a.manuscriptic", { day: "2026-10-20", seconds: 90 });
  writeWritingDay(storage, "b.manuscriptic", { day: "2026-10-20", seconds: 10 });
  assert.deepEqual(readWritingDay(storage, "a.manuscriptic"), { day: "2026-10-20", seconds: 90 });
  assert.deepEqual(readWritingDay(storage, "b.manuscriptic"), { day: "2026-10-20", seconds: 10 });
});

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
}
