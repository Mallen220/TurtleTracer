// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
/**
 * New shared util for the common UI elements.
 *
 *   <button class={ui.btn.primary}>Save</button>
 *   <input class="{ui.input} w-full" />
 *   <div class="{ui.alert.warning} flex items-center gap-2">...</div>
 *
 */

import {
  getButtonFilledClass,
  getSmallButtonClass,
} from "../utils/buttonStyles";

export type Tone =
  | "neutral"
  | "accent"
  | "info"
  | "success"
  | "warning"
  | "danger";

/** Builds `{ tone: class }` from a class that every tone shares. */
function eachTone<K extends string>(
  tones: Record<K, string>,
  shared: string,
): Record<K, string> {
  return Object.fromEntries(
    Object.entries<string>(tones).map(([name, classes]) => [
      name,
      `${shared} ${classes}`,
    ]),
  ) as Record<K, string>;
}

// ── Buttons ───────────────────────────────────────────────────────────────

type ButtonTone =
  | "primary"
  | "success"
  | "warning"
  | "danger"
  | "dangerSoft"
  | "secondary"
  | "outline"
  | "ghost";

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/60 disabled:opacity-50 disabled:cursor-not-allowed";

const BUTTON_TONE: Record<ButtonTone, string> = {
  primary: "bg-purple-600 hover:bg-purple-700 text-white",
  success: "bg-green-600 hover:bg-green-700 text-white",
  warning: "bg-amber-600 hover:bg-amber-700 text-white",
  danger: "bg-red-600 hover:bg-red-700 text-white",
  dangerSoft:
    "bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400",
  secondary:
    "bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300",
  outline:
    "border border-neutral-300 dark:border-neutral-600 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300",
  ghost:
    "hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-300",
};

/** Text buttons: `primary` for the main action, `ghost` for Cancel. */
const btn = eachTone(BUTTON_TONE, `${BUTTON_BASE} px-4 py-2 text-sm`);
/** The same buttons, smaller, for toolbars and dense panels. */
const btnSm = eachTone(BUTTON_TONE, `${BUTTON_BASE} px-3 py-1.5 text-xs`);

const ICON_BUTTON_BASE =
  "inline-flex items-center justify-center rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/60 disabled:opacity-40 disabled:cursor-not-allowed";

const ICON_BUTTON_TONE = {
  /** A tool that is switched on. */
  active:
    "bg-purple-100 text-purple-700 hover:bg-purple-200 dark:bg-purple-900/40 dark:text-purple-300 dark:hover:bg-purple-900/60",
  neutral:
    "text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:text-neutral-200 dark:hover:bg-neutral-700",
  danger:
    "text-neutral-500 hover:text-red-600 hover:bg-red-50 dark:text-neutral-400 dark:hover:text-red-400 dark:hover:bg-red-900/30",
};

/** A square button that only holds an icon. */
const iconBtn = eachTone(ICON_BUTTON_TONE, `${ICON_BUTTON_BASE} p-2`);
const iconBtnSm = eachTone(ICON_BUTTON_TONE, `${ICON_BUTTON_BASE} p-1`);

/** Inline text link, also for buttons that read as links. */
const link =
  "text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/60 rounded-md";

// ── Form controls ─────────────────────────────────────────────────────────

const INPUT_BASE =
  "rounded-md border border-neutral-300 dark:border-neutral-600 bg-neutral-50 dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-500 disabled:opacity-50 disabled:cursor-not-allowed";

/**
 * Text field, number field, select and textarea. Add `w-full` (or a fixed
 * width) in the markup, and `pl-9` for room for an icon.
 */
const input = `${INPUT_BASE} px-3 py-2 text-sm`;
const inputSm = `${INPUT_BASE} px-2 py-1.5 text-sm`;
const inputXs = `${INPUT_BASE} px-2 py-1 text-xs`;

/** Checkbox and radio button. */
const checkbox = "h-4 w-4 cursor-pointer accent-purple-600";

/** The text above a field. */
const label =
  "block text-sm font-medium text-neutral-700 dark:text-neutral-300";

// ── Text ──────────────────────────────────────────────────────────────────

/** Dialog and panel titles. */
const title = "text-lg font-bold text-neutral-900 dark:text-neutral-100";

/** Small capitalised heading that names a group of settings. */
const heading =
  "text-xs font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400";

// ── Surfaces ──────────────────────────────────────────────────────────────

/** A raised panel: white in light mode, one step above the page in dark. */
const card =
  "bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-md";

/** A quiet inset area for previews, code and hints. */
const well =
  "bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-md";

/** Anything that floats over the page: dropdowns, context menus, popovers. */
const popover =
  "bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-md shadow-xl";

/** A thin strip along the top of a panel: a toolbar, breadcrumb or search row. */
const bar =
  "bg-neutral-50 dark:bg-neutral-900/50 border-b border-neutral-200 dark:border-neutral-700";

/** A popover that holds a list of menu items. */
const menu = `${popover} py-1`;

const MENU_ITEM_BASE =
  "flex w-full items-center gap-2 px-4 py-2 text-left text-sm";

/** One row in a menu. */
const menuItem = `${MENU_ITEM_BASE} text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700`;
const menuItemDanger = `${MENU_ITEM_BASE} text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20`;

// ── Dialogs ───────────────────────────────────────────────────────────────

/** The dimmed backdrop that centres a dialog. Add a `z-[…]` in the markup. */
const overlay =
  "fixed inset-0 flex items-center justify-center bg-black/50 p-4";

/** The dialog panel. Add `w-full max-w-…` and any flex layout in the markup. */
const dialog =
  "bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-md shadow-xl";

const dialogHeader =
  "flex items-center justify-between px-6 py-4 border-b border-neutral-200 dark:border-neutral-700";

/** Add `justify-end` (or `justify-between`) in the markup. */
const dialogFooter =
  "flex items-center gap-3 px-6 py-4 border-t border-neutral-200 dark:border-neutral-700";

// ── Feedback ──────────────────────────────────────────────────────────────

const ALERT_TONE: Record<Tone, string> = {
  neutral:
    "bg-neutral-50 dark:bg-neutral-800/50 border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300",
  accent:
    "bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800 text-purple-800 dark:text-purple-200",
  info: "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200",
  success:
    "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-800 dark:text-green-200",
  warning:
    "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200",
  danger:
    "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200",
};

/** A coloured notice box. Lay out its contents (flex, gap) in the markup. */
const alert = eachTone(ALERT_TONE, "p-3 rounded-md border text-sm");

const BADGE_TONE: Record<Tone, string> = {
  neutral:
    "bg-neutral-100 dark:bg-neutral-700 border-neutral-200 dark:border-neutral-600 text-neutral-600 dark:text-neutral-300",
  accent:
    "bg-purple-100 dark:bg-purple-900/40 border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300",
  info: "bg-blue-100 dark:bg-blue-900/40 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300",
  success:
    "bg-green-100 dark:bg-green-900/40 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300",
  warning:
    "bg-amber-100 dark:bg-amber-900/40 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300",
  danger:
    "bg-red-100 dark:bg-red-900/40 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300",
};

/** The badge colours alone, for a chip with its own shape (a round icon). */
const badgeColor = BADGE_TONE;

/** Modified files are amber, staged ones green, everything else neutral. */
function gitTone(status: string | undefined): Tone {
  if (status === "modified") return "warning";
  if (status === "staged") return "success";
  return "neutral";
}

/** A small status label such as "Enabled" or "Modified". */
const badge = eachTone(
  BADGE_TONE,
  "inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-xs font-medium",
);

/** A keyboard key: "Ctrl", "K". */
const kbd =
  "font-mono text-xs px-1.5 py-0.5 rounded-md border border-neutral-200 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400";

/** The small hover label that explains a control. Position it in the markup. */
const tooltip =
  "px-2 py-1 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 shadow-lg text-xs text-neutral-800 dark:text-neutral-100 pointer-events-none whitespace-nowrap";

/** A checkbox or radio button with its text. */
const checkLabel =
  "flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300 cursor-pointer select-none";

// ── Action colours ────────────────────────────────────────────────────────
// Each kind of step (path, wait, rotate, macro, plugin actions) names a colour,
// see `buttonColor` on an action. These build the buttons that use it.

const KIND_BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-md font-medium text-white shadow-sm transition-colors focus:outline-none focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed";

/** A solid button in a step kind's colour ("green", "amber", "pink"...). */
function kindBtn(color: string, small = false) {
  const size = small ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm";
  return `${KIND_BUTTON_BASE} ${size} ${getButtonFilledClass(color)}`;
}

/** A small tinted button in a step kind's colour, e.g. "+ Wait". */
function kindChip(color: string) {
  return `inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/60 ${getSmallButtonClass(color)}`;
}

// ── Tabs ──────────────────────────────────────────────────────────────────

const TAB_BASE =
  "inline-flex items-center justify-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/60";

/** One button in a row of tabs (a segmented control). */
function tab(active: boolean) {
  return active
    ? `${TAB_BASE} bg-white dark:bg-neutral-700 shadow-sm text-neutral-900 dark:text-white`
    : `${TAB_BASE} text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200`;
}

/** The track a row of `tab()` buttons sits on. */
const tabList =
  "flex items-center gap-1 p-1 rounded-md bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700";

/** A tab that is underlined when active, for dialogs with a tab strip. */
function tabUnderline(active: boolean) {
  const base =
    "flex-1 py-3 text-sm font-medium border-b-2 transition-colors focus:outline-none";
  return active
    ? `${base} border-purple-500 text-purple-600 dark:text-purple-400`
    : `${base} border-transparent text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200`;
}

const NAV_ITEM_BASE =
  "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors";

/** One entry in a vertical list of sections, such as the settings sidebar. */
function navItem(active: boolean) {
  return active
    ? `${NAV_ITEM_BASE} bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300`
    : `${NAV_ITEM_BASE} text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800`;
}

const CHOICE_BASE =
  "px-3 py-2 text-sm rounded-md border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/60";

/** One option out of a few shown as buttons (drive type, rotation...). */
function choice(selected: boolean) {
  return selected
    ? `${CHOICE_BASE} bg-purple-50 dark:bg-purple-900/30 border-purple-500 text-purple-700 dark:text-purple-300`
    : `${CHOICE_BASE} bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-700`;
}

export const ui = {
  btn,
  btnSm,
  iconBtn,
  iconBtnSm,
  link,
  input,
  inputSm,
  inputXs,
  checkbox,
  label,
  title,
  heading,
  card,
  well,
  popover,
  bar,
  menu,
  menuItem,
  menuItemDanger,
  overlay,
  dialog,
  dialogHeader,
  dialogFooter,
  kbd,
  tooltip,
  checkLabel,
  kindBtn,
  kindChip,
  alert,
  badge,
  badgeColor,
  gitTone,
  tab,
  tabList,
  tabUnderline,
  navItem,
  choice,
};
