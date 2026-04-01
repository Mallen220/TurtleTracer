// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import type { SequenceMacroItem, SequencePathItem, SequenceItem } from "../types";
import { actionRegistry } from "../lib/actionRegistry";

export const pathKind = (): SequencePathItem["kind"] =>
  (actionRegistry.getAll().find((a: any) => a.isPath)
    ?.kind as SequencePathItem["kind"]) ?? "path";

export const macroKind = (): SequenceMacroItem["kind"] =>
  (actionRegistry.getAll().find((a: any) => a.isMacro)
    ?.kind as SequenceMacroItem["kind"]) ?? "macro";

export const isPathItem = (s: SequenceItem): s is SequencePathItem =>
  s.kind === pathKind();

export const isMacroItem = (s: SequenceItem): s is SequenceMacroItem =>
  s.kind === macroKind();
