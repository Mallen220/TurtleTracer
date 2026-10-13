// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, expect, it } from "vitest";
import postcss from "postcss";
import tailwindcss from "tailwindcss";
import { ui } from "../lib/ui";

const KIND_COLORS = [
  "green",
  "purple",
  "pink",
  "amber",
  "indigo",
  "blue",
  "red",
  "gray",
];

/** Every class string `ui` can hand out, with the options it takes. */
function everyPreset(): Record<string, string> {
  const presets: Record<string, string> = {};
  for (const [name, value] of Object.entries(ui)) {
    if (typeof value === "string") presets[name] = value;
    else if (typeof value === "object") {
      for (const [tone, classes] of Object.entries(value)) {
        presets[`${name}.${tone}`] = classes as string;
      }
    }
  }
  for (const active of [true, false]) {
    presets[`tab(${active})`] = ui.tab(active);
    presets[`tabUnderline(${active})`] = ui.tabUnderline(active);
    presets[`navItem(${active})`] = ui.navItem(active);
    presets[`choice(${active})`] = ui.choice(active);
    presets[`row(${active})`] = ui.row(active);
  }
  for (const color of KIND_COLORS) {
    presets[`kindBtn(${color})`] = ui.kindBtn(color);
    presets[`kindBtn(${color}, small)`] = ui.kindBtn(color, true);
    presets[`kindChip(${color})`] = ui.kindChip(color);
  }
  return presets;
}

const presets = everyPreset();

const COLOUR = String.raw`(white|black|transparent|(neutral|gray|slate|zinc|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d+)`;

/** The property a utility sets, used to spot two classes fighting over it. */
function conflictGroup(utility: string): string | null {
  if (utility.startsWith("px-")) return "padding-x";
  if (utility.startsWith("py-")) return "padding-y";
  if (utility.startsWith("p-")) return "padding";
  if (/^text-(xs|sm|base|lg|xl|2xl|3xl|\[.*\])$/.test(utility))
    return "text-size";
  if (/^font-(normal|medium|semibold|bold|light)$/.test(utility))
    return "font-weight";
  if (/^rounded(-|$)/.test(utility)) return "radius";
  if (/^shadow(-(sm|md|lg|xl|2xl|inner|none))?$/.test(utility)) return "shadow";
  if (new RegExp(`^bg-${COLOUR}`).test(utility)) return "background";
  if (new RegExp(`^text-${COLOUR}`).test(utility)) return "text-colour";
  if (new RegExp(`^border-${COLOUR}`).test(utility)) return "border-colour";
  if (/^(flex|inline-flex|block|inline-block|grid|hidden)$/.test(utility))
    return "display";
  if (utility.startsWith("justify-")) return "justify";
  if (utility.startsWith("items-")) return "align";
  if (utility.startsWith("gap-")) return "gap";
  return null;
}

const escapeSelector = (token: string) =>
  token.replaceAll(/[:/.[\]%#(),]/g, String.raw`\$&`);

describe("ui presets", () => {
  it("are non-empty class lists with no leftovers", () => {
    for (const [name, classes] of Object.entries(presets)) {
      expect(classes.trim(), name).not.toBe("");
      expect(classes, name).not.toMatch(/undefined|\$\{|\s{2,}/);
    }
  });

  it("never set the same property twice", () => {
    for (const [name, classes] of Object.entries(presets)) {
      const seen = new Map<string, string>();
      for (const token of classes.split(" ")) {
        // "dark:hover:bg-x" -> variants "dark:hover:", utility "bg-x"
        const split = token.lastIndexOf(":");
        const variants = token.slice(0, split + 1);
        const group = conflictGroup(token.slice(split + 1));
        if (!group) continue;
        const key = `${variants}${group}`;
        expect(
          seen.get(key),
          `${name}: "${token}" vs "${seen.get(key)}"`,
        ).toBeUndefined();
        seen.set(key, token);
      }
    }
  });

  it("only use classes that Tailwind actually generates", async () => {
    const tokens = new Set(Object.values(presets).flatMap((c) => c.split(" ")));
    const result = await postcss([
      tailwindcss({
        darkMode: "selector",
        content: [{ raw: [...tokens].join(" ") }],
      }),
    ]).process("@tailwind utilities;", { from: undefined });
    const missing = [...tokens].filter(
      (token) => !result.css.includes(`.${escapeSelector(token)}`),
    );
    expect(missing).toEqual([]);
  });

  it("give every tone of alerts and badges its own colours, except success, which is the accent", () => {
    for (const group of [ui.alert, ui.badge]) {
      const tones = Object.keys(group);
      expect(tones.sort()).toEqual(
        ["accent", "danger", "info", "neutral", "success", "warning"].sort(),
      );
      // Success is the accent: a second green beside it looked like a mistake.
      expect(group.success).toBe(group.accent);
      expect(new Set(Object.values(group)).size).toBe(tones.length - 1);
    }
  });

  it("makes success buttons the same as primary ones", () => {
    expect(ui.btn.success).toBe(ui.btn.primary);
    expect(ui.btnSm.success).toBe(ui.btnSm.primary);
  });

  it("show active and inactive states differently", () => {
    expect(ui.tab(true)).not.toBe(ui.tab(false));
    expect(ui.tabUnderline(true)).not.toBe(ui.tabUnderline(false));
    expect(ui.navItem(true)).not.toBe(ui.navItem(false));
    expect(ui.choice(true)).not.toBe(ui.choice(false));
  });

  it("colour git status badges", () => {
    expect(ui.gitTone("modified")).toBe("warning");
    expect(ui.gitTone("staged")).toBe("success");
    expect(ui.gitTone("untracked")).toBe("neutral");
    expect(ui.gitTone(undefined)).toBe("neutral");
  });
});
