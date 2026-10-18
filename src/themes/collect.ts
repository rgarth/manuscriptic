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

export function readThemes(): Theme[] {
  const rules: ThemeRule[] = [];
  for (const sheet of document.styleSheets) {
    let cssRules: CSSRuleList;
    try {
      cssRules = sheet.cssRules;
    } catch {
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
  } catch {
    return fallback;
  }
  return fallback;
}

export function applyTheme(id: string): void {
  document.documentElement.dataset.theme = id;
  try {
    localStorage.setItem(storageKey, id);
  } catch {
    return;
  }
}
