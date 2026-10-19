import { reportFailure } from "../failures.ts";

export type Theme = {
  id: string;
  label: string;
  order: number;
};

export type ThemeRule = {
  selectorText: string;
  label: string;
  order: string;
};

const storageKey = "manuscriptic-theme";

export function collectThemes(rules: ThemeRule[]): Theme[] {
  const themes: Theme[] = [];
  for (const rule of rules) {
    const match = /\[data-theme="([a-z0-9-]+)"\]/.exec(rule.selectorText);
    const id = match?.[1];
    if (!id) {
      continue;
    }
    const rawOrder = rule.order.trim();
    const order = rawOrder === "" ? 100 : Number(rawOrder);
    themes.push({
      id,
      label: rule.label.trim() || id,
      order: Number.isFinite(order) ? order : 100,
    });
  }
  themes.sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
  return themes;
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
      rules.push({
        selectorText: rule.selectorText,
        label: rule.style.getPropertyValue("--theme-label"),
        order: rule.style.getPropertyValue("--theme-order"),
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

export function applyTheme(id: string): void {
  try {
    localStorage.setItem(storageKey, id);
  } catch (error: unknown) {
    reportFailure(error, "Could not save the theme.");
    if (document.documentElement.dataset.theme) {
      return;
    }
  }
  document.documentElement.dataset.theme = id;
  for (const listener of themeListeners) {
    listener(id);
  }
}
