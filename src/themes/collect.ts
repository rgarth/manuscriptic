import { reportFailure } from "../failures.ts";

export type OpeningPaint = {
  room: string;
  faded: string;
  rule: string;
  nib: string;
  scheme: "light" | "dark" | null;
};

export type Theme = {
  id: string;
  label: string;
  order: number;
  opening: OpeningPaint | null;
};

export type ThemeRule = {
  selectorText: string;
  label: string;
  order: string;
  room: string;
  faded: string;
  rule: string;
  nib: string;
  scheme: string;
};

const storageKey = "manuscriptic-theme";
const openingKey = "manuscriptic-opening";
const openingProperties = ["--room", "--faded", "--rule", "--nib"] as const;

export function collectThemes(rules: ThemeRule[]): Theme[] {
  const themes: Theme[] = [];
  for (const rule of rules) {
    const match = /\[data-theme="([a-z0-9-]+)"\]/.exec(rule.selectorText);
    const id = match?.[1];
    if (!id) {
      continue;
    }
    const rawOrder = rule.order.trim();
    const parsed = rawOrder === "" ? 100 : Number(rawOrder);
    themes.push({
      id,
      label: rule.label.trim() || id,
      order: Number.isFinite(parsed) ? parsed : 100,
      opening: openingPaint(rule),
    });
  }
  themes.sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
  return themes;
}

function openingPaint(source: ThemeRule): OpeningPaint | null {
  const room = source.room.trim();
  const faded = source.faded.trim();
  const rule = source.rule.trim();
  const nib = source.nib.trim();
  if (!openingColor(room) || !openingColor(faded) || !openingColor(rule) || !openingColor(nib)) {
    return null;
  }
  return { room, faded, rule, nib, scheme: paintScheme(source.scheme.trim()) };
}

function paintScheme(value: string): OpeningPaint["scheme"] {
  switch (value) {
    case "light":
    case "dark":
      return value;
    default:
      return null;
  }
}

export function stylesheetAccess(href: string | null, pageOrigin: string): "read" | "skip" | "unreadable" {
  if (!href) {
    return "read";
  }
  try {
    return new URL(href).origin === pageOrigin ? "read" : "skip";
  } catch {
    return "unreadable";
  }
}

export function readThemes(): Theme[] {
  const rules: ThemeRule[] = [];
  for (const sheet of document.styleSheets) {
    const access = stylesheetAccess(sheet.href, window.location.origin);
    switch (access) {
      case "skip":
        continue;
      case "unreadable":
        reportFailure("A theme stylesheet could not be read.", "A theme stylesheet could not be read.");
        continue;
      case "read":
        break;
      default: {
        const unexpected: never = access;
        return unexpected;
      }
    }
    let cssRules: CSSRuleList;
    try {
      cssRules = sheet.cssRules;
    } catch (error: unknown) {
      reportFailure(error, "A theme stylesheet could not be read.");
      continue;
    }
    for (const rule of cssRules) {
      if (!(rule instanceof CSSStyleRule) || !rule.selectorText.includes("data-theme")) {
        continue;
      }
      const style = rule.style;
      rules.push({
        selectorText: rule.selectorText,
        label: style.getPropertyValue("--theme-label"),
        order: style.getPropertyValue("--theme-order"),
        room: style.getPropertyValue("--room"),
        faded: style.getPropertyValue("--faded"),
        rule: style.getPropertyValue("--rule"),
        nib: style.getPropertyValue("--nib"),
        scheme: style.getPropertyValue("color-scheme"),
      });
    }
  }
  return collectThemes(rules);
}

export function readTheme(available = readThemes()): string {
  const fallback = available[0]?.id ?? "parchment";
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved && (available.length === 0 || available.some((theme) => theme.id === saved))) {
      return saved;
    }
  } catch (error: unknown) {
    reportFailure(error, "The saved theme could not be read.");
    return fallback;
  }
  return fallback;
}

const themeListeners = new Set<(id: string) => void>();

export function onTheme(listener: (id: string) => void): () => void {
  themeListeners.add(listener);
  return () => {
    themeListeners.delete(listener);
  };
}

export function applyTheme(id: string, available = readThemes()): void {
  try {
    localStorage.setItem(storageKey, id);
  } catch (error: unknown) {
    reportFailure(error, "Could not save the theme.");
    if (document.documentElement.dataset.theme) {
      return;
    }
  }
  document.documentElement.dataset.theme = id;
  clearOpeningPaint();
  const theme = available.find((item) => item.id === id);
  if (theme) {
    rememberOpening(theme.opening);
  }
  for (const listener of themeListeners) {
    listener(id);
  }
}

function rememberOpening(opening: OpeningPaint | null): void {
  if (!opening) {
    dropOpening();
    return;
  }
  try {
    localStorage.setItem(openingKey, JSON.stringify(opening));
  } catch (error: unknown) {
    reportFailure(error, "Could not save the opening colors.");
    dropOpening();
  }
}

function dropOpening(): void {
  try {
    localStorage.removeItem(openingKey);
  } catch (error: unknown) {
    reportFailure(error, "Could not save the opening colors.");
  }
}

function clearOpeningPaint(): void {
  const style = document.documentElement.style;
  for (const name of openingProperties) {
    style.removeProperty(name);
  }
  style.colorScheme = "";
}

function openingColor(value: string): boolean {
  return value.length > 0 && value.length < 40 && !/[;{}]|url\s*\(/i.test(value);
}
