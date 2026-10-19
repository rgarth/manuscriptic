import assert from "node:assert/strict";
import { test } from "node:test";
import { lockHolder, lockQuestion, saveBlocked, stepVisit, type BookLock } from "./bookLock.ts";

const when = (since: number) => `t${since}`;

test("a window keeps the same lock holder across a reload", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
  const first = lockHolder(storage);
  assert.equal(lockHolder(storage), first);
  assert.notEqual(first, "");
});

test("a free lock and our own lock ask nothing", () => {
  assert.equal(lockQuestion({ state: "free" }, when), null);
  assert.equal(lockQuestion({ state: "ours" }, when), null);
});

test("a held book names the computer and does not steal quietly", () => {
  const held: BookLock = { state: "held", computer: "Kitchen", since: 5 };
  const question = lockQuestion(held, when);
  assert.match(question ?? "", /open on Kitchen, since t5/);
  assert.match(question ?? "", /takes the lock/);
  assert.match(question ?? "", /overwrite this copy/);
});

test("losing the lock stops saving until this window takes it back", () => {
  assert.equal(saveBlocked("held"), false);
  const lost = stepVisit("held", { name: "lose" });
  assert.deepEqual(lost, { visit: "lost", effect: "stop" });
  assert.equal(saveBlocked(lost.visit), true);
  assert.deepEqual(stepVisit(lost.visit, { name: "lose" }), { visit: "lost", effect: "none" });
  const asking = stepVisit(lost.visit, { name: "focus", path: "/books/Castus.manuscriptic" });
  assert.deepEqual(asking, { visit: "asking", effect: "ask" });
  assert.deepEqual(stepVisit(lost.visit, { name: "focus", path: null }), { visit: "lost", effect: "none" });
  assert.deepEqual(stepVisit(asking.visit, { name: "resume" }), { visit: "asking", effect: "none" });
  assert.deepEqual(stepVisit(asking.visit, { name: "blur" }), { visit: "asking", effect: "none" });
  assert.deepEqual(stepVisit(asking.visit, { name: "cancel" }), { visit: "held", effect: "drop" });
});

test("a failed reload asks again only after the window blurs", () => {
  const asking = stepVisit(stepVisit("held", { name: "lose" }).visit, { name: "resume" });
  assert.equal(asking.effect, "ask");
  const failed = stepVisit(stepVisit(asking.visit, { name: "failed" }).visit, { name: "settle" });
  assert.deepEqual(failed, { visit: "asked", effect: "none" });
  assert.deepEqual(stepVisit(failed.visit, { name: "focus", path: "/books/Castus.manuscriptic" }), {
    visit: "asked",
    effect: "none",
  });
  const blurred = stepVisit(failed.visit, { name: "blur" });
  assert.deepEqual(blurred, { visit: "lost", effect: "none" });
  assert.equal(stepVisit(blurred.visit, { name: "focus", path: "/books/Castus.manuscriptic" }).effect, "ask");
  assert.deepEqual(stepVisit("held", { name: "blur" }), { visit: "held", effect: "none" });
});

test("leaving the book during the warning does not clear a lock already held", () => {
  assert.deepEqual(stepVisit("asking", { name: "settle" }), { visit: "asked", effect: "none" });
  const reloaded = stepVisit(stepVisit("lost", { name: "resume" }).visit, { name: "reloaded" });
  assert.deepEqual(reloaded, { visit: "held", effect: "saved" });
  assert.deepEqual(stepVisit(reloaded.visit, { name: "settle" }), { visit: "held", effect: "none" });
});
