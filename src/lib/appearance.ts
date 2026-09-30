// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Applies the chosen colour theme, font size and corner style to the document.
import type { Settings } from "../types";
import type { CustomTheme } from "./pluginsStore";
import { POTATO_THEME_CSS } from "../utils/potatoTheme";

const CUSTOM_STYLE_ID = "custom-theme-style";
const POTATO_ROBOT_IMAGE = "/JefferyThePotato.png";

// Class added for the active plugin theme so its CSS can be scoped.
let customThemeClass: string | null = null;

export function isPotatoMode(settings: Settings): boolean {
  const now = new Date();
  const isAprilFools = now.getMonth() === 3 && now.getDate() === 1;
  return settings.robotImage === POTATO_ROBOT_IMAGE || isAprilFools;
}

function setCustomStyle(css: string | null) {
  document.getElementById(CUSTOM_STYLE_ID)?.remove();
  if (css === null) return;
  const style = document.createElement("style");
  style.id = CUSTOM_STYLE_ID;
  style.textContent = css;
  document.head.appendChild(style);
}

function setCustomThemeClass(className: string | null) {
  const root = document.documentElement;
  if (customThemeClass && customThemeClass !== className) {
    root.classList.remove(customThemeClass);
  }
  if (className) root.classList.add(className);
  customThemeClass = className;
}

/**
 * Applies `settings.theme`: "light", "dark", "auto" (follow the OS) or the
 * name of a theme registered by a plugin.
 */
export function applyTheme(settings: Settings, customThemes: CustomTheme[]) {
  const root = document.documentElement;

  if (isPotatoMode(settings)) {
    setCustomStyle(POTATO_THEME_CSS);
    setCustomThemeClass(null);
    // The potato styles are written on top of the light theme.
    root.classList.remove("dark");
    root.classList.add("potato-mode");
    return;
  }
  root.classList.remove("potato-mode");

  const theme = settings.theme || "auto";
  const custom = customThemes.find((t) => t.name === theme);
  if (custom) {
    setCustomStyle(custom.css);
    setCustomThemeClass(
      `theme-${theme.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}`,
    );
    // Plugin themes are written on top of the dark theme.
    root.classList.add("dark");
    return;
  }

  setCustomStyle(null);
  setCustomThemeClass(null);
  const dark =
    theme === "dark" ||
    (theme === "auto" &&
      globalThis.matchMedia("(prefers-color-scheme: dark)").matches);
  root.classList.toggle("dark", dark);
}

export function applyFontSize(settings: Settings) {
  document.documentElement.style.fontSize = `${settings.programFontSize || 100}%`;
}

/**
 * Squares off every corner in the interface. The rules live in app.scss under
 * `html.squared-corners`. Potato mode keeps its own rounded look.
 */
export function applySquaredCorners(settings: Settings) {
  const squared = !!settings.squaredCorners && !isPotatoMode(settings);
  document.documentElement.classList.toggle("squared-corners", squared);
}
