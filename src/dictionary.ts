const wordPattern = /^[\p{L}][\p{L}'’-]*$/u;
const wordsPattern = /[\p{L}][\p{L}'’-]*/gu;

export function cleanWord(value: string): string | null {
  const word = value.trim();
  if (!wordPattern.test(word)) {
    return null;
  }
  return word;
}

export function includesWord(words: readonly string[], word: string): boolean {
  const key = word.toLocaleLowerCase();
  return words.some((entry) => entry.toLocaleLowerCase() === key);
}

export function uniqueWords(words: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const word of words) {
    const clean = cleanWord(word);
    if (!clean) {
      continue;
    }
    const key = clean.toLocaleLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(clean);
  }
  return unique;
}

export function wordAt(
  text: string,
  index: number,
): { word: string; from: number; to: number } | null {
  for (const found of wordsIn(text)) {
    if (index >= found.from && index <= found.to) {
      return found;
    }
  }
  return null;
}

export function wordsIn(text: string): { word: string; from: number; to: number }[] {
  const found: { word: string; from: number; to: number }[] = [];
  for (const match of text.matchAll(wordsPattern)) {
    const from = match.index ?? 0;
    const word = match[0];
    found.push({ word, from, to: from + word.length });
  }
  return found;
}
