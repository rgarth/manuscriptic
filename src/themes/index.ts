import.meta.glob("./*.css", { eager: true });

export {
  applyTheme,
  collectThemes,
  onTheme,
  readTheme,
  readThemes,
  type Theme,
  type ThemeRule,
} from "./collect";
