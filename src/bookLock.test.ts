import assert from "node:assert/strict";
import { test } from "node:test";
import { lockHolder, lockQuestion, type BookLock } from "./bookLock.ts";

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
