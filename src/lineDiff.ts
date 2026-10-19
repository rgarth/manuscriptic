export type Hunk = {
  at: number;
  remove: string[];
  insert: string[];
};

export function diffLines(before: string, after: string): Hunk[] {
  const previous = linesOf(before);
  const next = linesOf(after);
  const table = lcs(previous, next);
  const hunks: Hunk[] = [];
  let removed: string[] = [];
  let inserted: string[] = [];
  let at = 0;
  let pendingAt = 0;
  function flush() {
    if (removed.length === 0 && inserted.length === 0) {
      return;
    }
    hunks.push({ at: pendingAt, remove: removed, insert: inserted });
    removed = [];
    inserted = [];
  }
  let left = 0;
  let right = 0;
  while (left < previous.length && right < next.length) {
    if (previous[left] === next[right]) {
      flush();
      left += 1;
      right += 1;
      at = left;
      continue;
    }
    if (table[left + 1]?.[right] === table[left]?.[right + 1]) {
      if (removed.length === 0 && inserted.length === 0) {
        pendingAt = at;
      }
      removed.push(previous[left] ?? "");
      left += 1;
      continue;
    }
    if ((table[left + 1]?.[right] ?? 0) >= (table[left]?.[right + 1] ?? 0)) {
      if (removed.length === 0 && inserted.length === 0) {
        pendingAt = at;
      }
      removed.push(previous[left] ?? "");
      left += 1;
      continue;
    }
    if (removed.length === 0 && inserted.length === 0) {
      pendingAt = at;
    }
    inserted.push(next[right] ?? "");
    right += 1;
  }
  if (left < previous.length || right < next.length) {
    if (removed.length === 0 && inserted.length === 0) {
      pendingAt = at;
    }
    removed.push(...previous.slice(left));
    inserted.push(...next.slice(right));
  }
  flush();
  return hunks;
}

export function applyHunks(before: string, hunks: Hunk[]): string {
  const lines = linesOf(before);
  let shift = 0;
  for (const hunk of hunks) {
    const at = hunk.at + shift;
    lines.splice(at, hunk.remove.length, ...hunk.insert);
    shift += hunk.insert.length - hunk.remove.length;
  }
  return joinLines(lines);
}

function linesOf(text: string): string[] {
  if (text.length === 0) {
    return [];
  }
  const lines = text.split("\n");
  if (text.endsWith("\n")) {
    lines.pop();
  }
  return lines;
}

function joinLines(lines: string[]): string {
  return lines.length === 0 ? "" : `${lines.join("\n")}\n`;
}

function lcs(previous: string[], next: string[]): number[][] {
  const table: number[][] = Array.from({ length: previous.length + 1 }, () =>
    Array.from({ length: next.length + 1 }, () => 0),
  );
  for (let left = previous.length - 1; left >= 0; left -= 1) {
    for (let right = next.length - 1; right >= 0; right -= 1) {
      const row = table[left];
      const below = table[left + 1];
      if (!row || !below) {
        continue;
      }
      row[right] =
        previous[left] === next[right]
          ? (below[right + 1] ?? 0) + 1
          : Math.max(below[right] ?? 0, row[right + 1] ?? 0);
    }
  }
  return table;
}
