<!-- Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0. -->
<script lang="ts">
  import { onMount } from "svelte";
  import hotkeys from "hotkeys-js";
  import CommandPalette from "./CommandPalette.svelte";
  import {
    gridSize,
    showGrid,
    snapToGrid,
    showProtractor,
    showShortcuts,
    showSettings,
    isPresentationMode,
    selectedPointId,
    selectedLineId,
    toggleCollapseAllTrigger,
    fieldZoom,
    fieldPan,
    focusRequest,
    exportDialogState,
    showFileManager,
    fileManagerNewFileMode,
    showPluginManager,
    showRuler,
  } from "../../stores";
  import {
    startPointStore,
    linesStore,
    shapesStore,
    sequenceStore,
    settingsStore,
    playingStore,
    playbackSpeedStore,
    renumberDefaultPathNames,
  } from "../projectStore";
  import {
    updateLinkedWaypoints,
    updateLinkedWaits,
    updateLinkedRotations,
  } from "../../utils/pointLinking";
  import { loadFile, loadRecentFile } from "../../utils/fileHandlers";
  import { validatePath } from "../../utils/validation";
  import type { Line, SequenceItem } from "../../types/index";
  import { createTriangle } from "../../utils";
  import { toggleDiff } from "../../lib/diffStore";
  import {
    DEFAULT_KEY_BINDINGS,
    FIELD_SIZE,
    DEFAULT_SETTINGS,
    getDefaultStartPoint,
    AVAILABLE_FIELD_MAPS,
  } from "../../config";
  import { getRandomColor } from "../../utils";
  import { computeZoomStep } from "../zoomHelpers";
  import _ from "lodash";

  // Actions
  export let saveProject: () => void;
  export let resetProject: () => void;
  export let saveFileAs: () => void;
  export let exportGif: () => void;
  export let undoAction: () => void;
  export let redoAction: () => void;
  export let play: () => void;
  export let pause: () => void;
  export let resetAnimation: () => void;
  export let stepForward: () => void;
  export let stepBackward: () => void;
  export let recordChange: () => void;
  export let controlTabRef: any = null;
  export let activeControlTab: "path" | "field" | "table" = "path";
  export let toggleStats: () => void = () => {};
  export let toggleSidebar: () => void = () => {};
  export let fieldRenderer: any = null;

  // Optional callback provided by App.svelte to open the What's New dialog
  export let openWhatsNew: () => void;
  // This is no longer passed as a prop, handled internally, but kept for compatibility if needed.
  // We'll mark it optional or ignore if passed.
  export let toggleCommandPalette: (() => void) | undefined = undefined;

  // Reactive Values
  $: settings = $settingsStore;
  $: lines = $linesStore;
  $: startPoint = $startPointStore;
  $: shapes = $shapesStore;
  $: sequence = $sequenceStore;
  $: playing = $playingStore;
  $: playbackSpeed = $playbackSpeedStore;

  // Internal State
  let clipboard: SequenceItem | Line | null = null;
  let showCommandPalette = false;
  let fileInput: HTMLInputElement;
  let fileCommands: {
    id: string;
    label: string;
    action: () => void;
    category: string;
  }[] = [];

  async function fetchFiles() {
    if (!window.electronAPI) return;
    try {
      let dir: string | null = await window.electronAPI.getSavedDirectory();
      if (!dir) dir = await window.electronAPI.getDirectory();
      if (dir) {
        const files = await window.electronAPI.listFiles(dir);
        fileCommands = files
          .filter((f) => f.name.endsWith(".pp"))
          .map((f) => ({
            id: `file-${f.name}`,
            label: `Open File: ${f.name}`,
            action: () => loadRecentFile(f.path),
            category: "File",
          }));
      }
    } catch (err) {
      console.warn("Failed to fetch files for command palette", err);
    }
  }

  $: if (showCommandPalette) {
    fetchFiles();
  }

  function isUIElementFocused(): boolean {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return false;
    const tag = el.tagName;
    return (
      ["INPUT", "TEXTAREA", "SELECT"].includes(tag) ||
      (el as any).isContentEditable
    );
  }

  function isInputFocused(): boolean {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return false;
    const tag = el.tagName;
    return (
      ["INPUT", "TEXTAREA", "SELECT"].includes(tag) ||
      (el as any).isContentEditable
    );
  }

  function isButtonFocused(): boolean {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return false;
    const tag = el.tagName;
    return tag === "BUTTON" || el.getAttribute("role") === "button";
  }

  function shouldBlockShortcut(e: KeyboardEvent): boolean {
    if (isInputFocused()) return true;
    if (isButtonFocused()) {
      // If focused on a button, only block interaction keys (Space, Enter)
      // BUT allow them if modifiers are present (e.g. Shift+Enter)
      if (
        (e.key === " " || e.key === "Enter") &&
        !e.shiftKey &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey
      ) {
        return true;
      }
    }
    return false;
  }

  function getKey(action: string): string {
    const bindings = settings?.keyBindings || DEFAULT_KEY_BINDINGS;
    const binding = bindings.find((b) => b.action === action);
    return binding ? binding.key : "";
  }

  // --- Logic Extracted from App.svelte ---

  // Helper: get the sequence index corresponding to the current selection
  function getSelectedSequenceIndex(): number | null {
    const sel = $selectedPointId;
    const seq = $sequenceStore;
    if (!sel) return null;

    // Selected item is a wait
    if (sel.startsWith("wait-")) {
      const wid = sel.substring(5);
      const idx = seq.findIndex(
        (s) => s.kind === "wait" && (s as any).id === wid,
      );
      return idx >= 0 ? idx : null;
    }

    // Selected item is a rotate
    if (sel.startsWith("rotate-")) {
      const rid = sel.substring(7);
      const idx = seq.findIndex(
        (s) => s.kind === "rotate" && (s as any).id === rid,
      );
      return idx >= 0 ? idx : null;
    }

    // Selected item is a point/control point; map to the selected line id
    if (sel.startsWith("point-")) {
      const targetId = $selectedLineId || null;
      if (!targetId) return null;
      const idx = seq.findIndex(
        (s) => s.kind === "path" && (s as any).lineId === targetId,
      );
      return idx >= 0 ? idx : null;
    }

    return null;
  }

  function addNewLine() {
    const newLine: Line = {
      id: `line-${Math.random().toString(36).slice(2)}`,
      name: "",
      endPoint: {
        x: _.random(36, 108),
        y: _.random(36, 108),
        heading: "tangential",
        reverse: false,
      },
      controlPoints: [],
      color: getRandomColor(),
      locked: false,
    };

    // Determine where to insert: after selected sequence item if applicable
    const insertIdx = getSelectedSequenceIndex();
    if (insertIdx === null) {
      // Append to end
      linesStore.update((l) => renumberDefaultPathNames([...l, newLine]));
      sequenceStore.update((s) => [
        ...s,
        { kind: "path", lineId: newLine.id! },
      ]);
      selectedLineId.set(newLine.id!);
      const newIndex = $linesStore.length - 1;
      selectedPointId.set(`point-${newIndex + 1}-0`);
    } else {
      // Append the new line to lines array and renumber
      linesStore.update((l) => renumberDefaultPathNames([...l, newLine]));
      // Insert into sequence after insertIdx
      sequenceStore.update((s) => {
        const s2 = [...s];
        s2.splice(insertIdx + 1, 0, { kind: "path", lineId: newLine.id! });
        return s2;
      });
      // Select the newly created line
      selectedLineId.set(newLine.id!);
      // After insertion, the new line will be at the end of lines array
      const newIndex = $linesStore.length - 1;
      selectedPointId.set(`point-${newIndex + 1}-0`);
    }

    recordChange();
  }

  function addWait() {
    const wait: SequenceItem = {
      kind: "wait",
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      name: "",
      durationMs: 1000,
      locked: false,
    };

    const insertIdx = getSelectedSequenceIndex();
    if (insertIdx === null) {
      sequenceStore.update((s) => [...s, wait]);
    } else {
      sequenceStore.update((s) => {
        const s2 = [...s];
        s2.splice(insertIdx + 1, 0, wait);
        return s2;
      });
    }

    selectedPointId.set(`wait-${wait.id}`);
    selectedLineId.set(null);
    recordChange();
  }

  function addRotate() {
    const rotate: SequenceItem = {
      kind: "rotate",
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      name: "",
      degrees: 0,
      locked: false,
    };

    const insertIdx = getSelectedSequenceIndex();
    if (insertIdx === null) {
      sequenceStore.update((s) => [...s, rotate]);
    } else {
      sequenceStore.update((s) => {
        const s2 = [...s];
        s2.splice(insertIdx + 1, 0, rotate);
        return s2;
      });
    }

    selectedPointId.set(`rotate-${rotate.id}`);
    selectedLineId.set(null);
    recordChange();
  }

  function addEventMarker() {
    // Check if a wait is selected
    if ($selectedPointId && $selectedPointId.startsWith("wait-")) {
      const waitId = $selectedPointId.substring(5);
      const waitItem = sequence.find(
        (s) => s.kind === "wait" && (s as any).id === waitId,
      ) as any;

      if (waitItem) {
        if (waitItem.locked) return;
        waitItem.eventMarkers = waitItem.eventMarkers || [];
        waitItem.eventMarkers.push({
          id: `event-${Date.now()}`,
          name: "",
          position: 0.5,
        });
        sequenceStore.set(sequence);
        recordChange();
        return;
      }
    }

    const targetId =
      $selectedLineId || (lines.length > 0 ? lines[lines.length - 1].id : null);
    const targetLine = targetId ? lines.find((l) => l.id === targetId) : null;
    if (targetLine) {
      if (targetLine.locked) return; // Don't allow adding event markers to locked lines
      targetLine.eventMarkers = targetLine.eventMarkers || [];
      targetLine.eventMarkers.push({
        id: `event-${Date.now()}`,
        name: "",
        position: 0.5,
      });
      linesStore.set(lines);
      recordChange();
    }
  }

  function addControlPoint() {
    if (lines.length === 0) return;
    const targetId = $selectedLineId || lines[lines.length - 1].id;
    const targetLine =
      lines.find((l) => l.id === targetId) || lines[lines.length - 1];
    if (!targetLine) return;
    if (targetLine.locked) return; // Don't allow adding control points to locked lines

    targetLine.controlPoints.push({
      x: _.random(36, 108),
      y: _.random(36, 108),
    });
    linesStore.set(lines);
    const lineIndex = lines.findIndex((l) => l.id === targetLine.id);
    const cpIndex = targetLine.controlPoints.length;
    selectedLineId.set(targetLine.id as string);
    selectedPointId.set(`point-${lineIndex + 1}-${cpIndex}`);
    recordChange();
  }

  function removeControlPoint() {
    if (lines.length > 0) {
      const targetId = $selectedLineId || lines[lines.length - 1].id;
      const targetLine =
        lines.find((l) => l.id === targetId) || lines[lines.length - 1];
      if (targetLine && targetLine.controlPoints.length > 0) {
        if (targetLine.locked) return; // Don't allow removing control points from locked lines
        targetLine.controlPoints.pop();
        linesStore.set(lines);
        recordChange();
      }
    }
  }

  // Helper to generate unique name
  const generateName = (baseName: string, existingNames: string[]) => {
    // Regex to match "Name duplicate" or "Name duplicate N"
    const match = baseName.match(/^(.*?) duplicate(?: (\d+))?$/);

    let rootName = baseName;
    let startNum = 1;

    if (match) {
      rootName = match[1];
      startNum = match[2] ? parseInt(match[2], 10) : 1;
      // If we are duplicating a duplicate, we probably want to start incrementing from its number + 1
      startNum++;
    }

    // Try candidates starting from the determined number
    let candidate = "";
    let i = startNum;

    // Safety/Sanity: loop limit to prevent infinite hangs in weird edge cases
    while (i < 1000) {
      if (i === 1) {
        candidate = rootName + " duplicate";
      } else {
        candidate = rootName + " duplicate " + i;
      }

      if (!existingNames.includes(candidate)) {
        return candidate;
      }
      i++;
    }
    return rootName + " duplicate " + Date.now(); // Fallback
  };

  function duplicate() {
    if (isUIElementFocused()) return;
    const sel = $selectedPointId;
    if (!sel) return;

    if (sel.startsWith("wait-")) {
      const waitId = sel.substring(5);
      const waitItem = $sequenceStore.find(
        (s) => s.kind === "wait" && (s as any).id === waitId,
      ) as any;
      if (!waitItem) return;

      const newWait = _.cloneDeep(waitItem);
      newWait.id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

      const existingWaitNames = sequence
        .filter((s) => s.kind === "wait")
        .map((s) => (s as any).name || "");
      // Preserve empty name when duplicating unnamed waits
      if (waitItem.name && waitItem.name.trim() !== "") {
        newWait.name = generateName(waitItem.name, existingWaitNames);
      } else {
        newWait.name = "";
      }

      const insertIdx = getSelectedSequenceIndex();
      if (insertIdx !== null) {
        sequenceStore.update((s) => {
          const s2 = [...s];
          s2.splice(insertIdx + 1, 0, newWait);
          return s2;
        });
        selectedPointId.set(`wait-${newWait.id}`);
        recordChange();
      }
      return;
    }

    if (sel.startsWith("rotate-")) {
      const rotateId = sel.substring(7);
      const rotateItem = $sequenceStore.find(
        (s) => s.kind === "rotate" && (s as any).id === rotateId,
      ) as any;
      if (!rotateItem) return;

      const newRotate = _.cloneDeep(rotateItem);
      newRotate.id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      const existingRotateNames = sequence
        .filter((s) => s.kind === "rotate")
        .map((s) => (s as any).name || "");
      // Preserve empty name when duplicating unnamed rotates
      if (rotateItem.name && rotateItem.name.trim() !== "") {
        newRotate.name = generateName(rotateItem.name, existingRotateNames);
      } else {
        newRotate.name = "";
      }

      const insertIdx = getSelectedSequenceIndex();
      if (insertIdx !== null) {
        sequenceStore.update((s) => {
          const s2 = [...s];
          s2.splice(insertIdx + 1, 0, newRotate);
          return s2;
        });
        selectedPointId.set(`rotate-${newRotate.id}`);
        recordChange();
      }
      return;
    }

    // Path duplication
    let targetLineId: string | null = null;
    if (sel.startsWith("point-")) {
      const parts = sel.split("-");
      const lineNum = Number(parts[1]);
      if (lineNum > 0) {
        targetLineId = lines[lineNum - 1].id || null;
      }
    }
    if ($selectedLineId) targetLineId = $selectedLineId;

    if (targetLineId) {
      const lineIndex = lines.findIndex((l) => l.id === targetLineId);
      if (lineIndex === -1) return;
      const originalLine = lines[lineIndex];

      // Calculate relative offset
      // Previous point (start of original line)
      let prevPoint: { x: number; y: number } = startPoint;
      if (lineIndex > 0) {
        prevPoint = lines[lineIndex - 1].endPoint;
      }

      const deltaX = originalLine.endPoint.x - prevPoint.x;
      const deltaY = originalLine.endPoint.y - prevPoint.y;

      const newLine = _.cloneDeep(originalLine);
      newLine.id = `line-${Math.random().toString(36).slice(2)}`;

      // Update name (preserve empty name if original was unnamed)
      const existingLineNames = lines.map((l) => l.name || "");
      if (originalLine.name && originalLine.name.trim() !== "") {
        newLine.name = generateName(originalLine.name, existingLineNames);
      } else {
        newLine.name = "";
      }

      // Apply offset to endPoint
      newLine.endPoint.x += deltaX;
      newLine.endPoint.y += deltaY;

      // Apply offset to control points
      newLine.controlPoints.forEach((cp) => {
        cp.x += deltaX;
        cp.y += deltaY;
      });

      // Insert line
      linesStore.update((l) => {
        const newLines = [...l];
        newLines.splice(lineIndex + 1, 0, newLine);
        return renumberDefaultPathNames(newLines);
      });

      // Insert into sequence
      // We need to find where the original line was in the sequence
      const seqIdx = sequence.findIndex(
        (s) => s.kind === "path" && s.lineId === originalLine.id,
      );
      if (seqIdx !== -1) {
        sequenceStore.update((s) => {
          const s2 = [...s];
          s2.splice(seqIdx + 1, 0, { kind: "path", lineId: newLine.id! });
          return s2;
        });
      } else {
        // Fallback: append
        sequenceStore.update((s) => [
          ...s,
          { kind: "path", lineId: newLine.id! },
        ]);
      }

      selectedLineId.set(newLine.id!);
      selectedPointId.set(`point-${lineIndex + 2}-0`); // Selected the end point of new line
      recordChange();
    }
  }

  function copy() {
    if (isUIElementFocused()) return;
    const sel = $selectedPointId;
    if (!sel) return;

    if (sel.startsWith("wait-")) {
      const waitId = sel.substring(5);
      const waitItem = $sequenceStore.find(
        (s) => s.kind === "wait" && (s as any).id === waitId,
      ) as any;
      if (waitItem) {
        clipboard = _.cloneDeep(waitItem);
      }
      return;
    }

    if (sel.startsWith("rotate-")) {
      const rotateId = sel.substring(7);
      const rotateItem = $sequenceStore.find(
        (s) => s.kind === "rotate" && (s as any).id === rotateId,
      ) as any;
      if (rotateItem) {
        clipboard = _.cloneDeep(rotateItem);
      }
      return;
    }

    let targetLineId: string | null = null;
    if (sel.startsWith("point-")) {
      const parts = sel.split("-");
      const lineNum = Number(parts[1]);
      if (lineNum > 0) {
        targetLineId = lines[lineNum - 1].id || null;
      }
    }
    if ($selectedLineId) targetLineId = $selectedLineId;

    if (targetLineId) {
      const line = lines.find((l) => l.id === targetLineId);
      if (line) {
        clipboard = _.cloneDeep(line);
      }
    }
  }

  function cut() {
    if (isUIElementFocused()) return;
    copy();
    removeSelected();
  }

  function paste() {
    if (isUIElementFocused()) return;
    if (!clipboard) return;

    // Handle Wait
    if ((clipboard as any).kind === "wait") {
      const waitItem = clipboard as SequenceItem;
      const newWait = _.cloneDeep(waitItem) as any;
      newWait.id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

      // Generate unique name
      const existingWaitNames = sequence
        .filter((s) => s.kind === "wait")
        .map((s) => (s as any).name || "");
      if (newWait.name && newWait.name.trim() !== "") {
        newWait.name = generateName(newWait.name, existingWaitNames);
      } else {
        newWait.name = "";
      }

      const insertIdx = getSelectedSequenceIndex();
      if (insertIdx !== null) {
        sequenceStore.update((s) => {
          const s2 = [...s];
          s2.splice(insertIdx + 1, 0, newWait);
          return s2;
        });
      } else {
        sequenceStore.update((s) => [...s, newWait]);
      }
      selectedPointId.set(`wait-${newWait.id}`);
      recordChange();
      return;
    }

    // Handle Rotate
    if ((clipboard as any).kind === "rotate") {
      const rotateItem = clipboard as SequenceItem;
      const newRotate = _.cloneDeep(rotateItem) as any;
      newRotate.id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

      // Generate unique name
      const existingRotateNames = sequence
        .filter((s) => s.kind === "rotate")
        .map((s) => (s as any).name || "");
      if (newRotate.name && newRotate.name.trim() !== "") {
        newRotate.name = generateName(newRotate.name, existingRotateNames);
      } else {
        newRotate.name = "";
      }

      const insertIdx = getSelectedSequenceIndex();
      if (insertIdx !== null) {
        sequenceStore.update((s) => {
          const s2 = [...s];
          s2.splice(insertIdx + 1, 0, newRotate);
          return s2;
        });
      } else {
        sequenceStore.update((s) => [...s, newRotate]);
      }
      selectedPointId.set(`rotate-${newRotate.id}`);
      recordChange();
      return;
    }

    // Handle Path (Line)
    // Clipboard doesn't strictly have 'kind' property for Line type, but we can check properties or if it doesn't have kind.
    // Line interface has 'id', 'endPoint', 'controlPoints'
    if (!(clipboard as any).kind && (clipboard as any).endPoint) {
      const originalLine = clipboard as Line;

      // Logic similar to duplicate for path placement
      // We need to determine where to place this new line spatially.
      // Usually Paste puts it after the selection.

      // Determine insertion point
      const insertIdx = getSelectedSequenceIndex(); // index in sequence
      let prevPoint: { x: number; y: number } = startPoint;

      // If we are inserting after a specific path, use its endpoint as reference
      if (insertIdx !== null) {
        // Find path element at or before insertIdx
        for (let i = insertIdx; i >= 0; i--) {
          if (sequence[i].kind === "path") {
            const lineId = (sequence[i] as any).lineId;
            const l = lines.find((line) => line.id === lineId);
            if (l) {
              prevPoint = l.endPoint;
              break;
            }
          }
        }
      } else if (lines.length > 0) {
        prevPoint = lines[lines.length - 1].endPoint;
      }

      // We need to calculate the relative vector of the copied line
      // But we don't have the original 'previous point' of the copied line easily available here unless we store it.
      // However, usually copy/paste of a path segment implies copying the shape/vector.
      // If we simply copy endPoint, it will snap to the original location.
      // For now, let's paste it "relative" if possible, or just exact copy if we can't determine relation.
      // Wait, `duplicate` calculates delta from the line BEFORE the duplicated line.
      // `clipboard` is just the line object. We lost context of where it came from.
      // So we can either:
      // 1. Paste it exactly (might overlap if not moved).
      // 2. Paste it with a small offset from previous point?
      // 3. Assume the clipboard line vector is (endPoint - origin_of_copy). We don't know origin_of_copy.

      // Let's assume the user wants an exact copy of the properties (heading, etc) but positioned after current selection.
      // If we just use the coordinate in clipboard, it jumps back to where it was copied.
      // If we want "continuation", we probably want to preserve the relative vector?
      // But we don't have the relative vector in `Line` object (it stores absolute coordinates).

      // Heuristic: If we paste, maybe we just offset it slightly from the insertion point?
      // Or we can try to "guess" a delta.
      // Let's just paste it with a small offset (e.g. 10, 10) from the previous point, similar to "Add Path".
      // But preserving control points relative structure?

      // Better approach: Calculate the vector of the copied line relative to (0,0)? No.
      // Let's just Paste it exactly as is?
      // If I copy a segment at (50,50), and paste it, and it appears at (50,50), that's standard "Copy/Paste" behavior in vector apps often.
      // "Duplicate" is the one that often does "Step and Repeat" or relative offset.
      // So for Paste, exact coordinates might be safer/expected, OR offset by a bit if it overlaps exactly.

      // Let's stick to: Paste exactly, but regenerate ID and Name.
      // If it overlaps, user can move it.

      const newLine = _.cloneDeep(originalLine);
      newLine.id = `line-${Math.random().toString(36).slice(2)}`;

      const existingLineNames = lines.map((l) => l.name || "");
      if (newLine.name && newLine.name.trim() !== "") {
        newLine.name = generateName(newLine.name, existingLineNames);
      } else {
        newLine.name = "";
      }

      // Insert
      if (insertIdx !== null) {
        // We need to find the line index corresponding to insertIdx
        // This is tricky because sequence and lines indices aren't 1:1.
        // But we insert into `lines` array based on where the sequence item at `insertIdx` is.
        // If sequence[insertIdx] is a path, we insert after that line in `lines`.
        // If sequence[insertIdx] is a wait, we need to find the path before it to know where in `lines` to insert?
        // Actually `lines` order usually matches `sequence` path order.
        // Let's find the last path item in sequence up to insertIdx.

        let insertionLineIndex = -1;
        for (let i = insertIdx; i >= 0; i--) {
          if (sequence[i].kind === "path") {
            const lid = (sequence[i] as any).lineId;
            insertionLineIndex = lines.findIndex((l) => l.id === lid);
            break;
          }
        }

        // If no path found before, insert at 0?
        // If found, insert after.
        if (insertionLineIndex === -1) {
          linesStore.update((l) => {
            const newLines = [...l];
            newLines.splice(0, 0, newLine);
            return renumberDefaultPathNames(newLines);
          });
        } else {
          linesStore.update((l) => {
            const newLines = [...l];
            newLines.splice(insertionLineIndex + 1, 0, newLine);
            return renumberDefaultPathNames(newLines);
          });
        }

        sequenceStore.update((s) => {
          const s2 = [...s];
          s2.splice(insertIdx + 1, 0, { kind: "path", lineId: newLine.id! });
          return s2;
        });
      } else {
        // Append
        linesStore.update((l) => renumberDefaultPathNames([...l, newLine]));
        sequenceStore.update((s) => [
          ...s,
          { kind: "path", lineId: newLine.id! },
        ]);
      }

      selectedLineId.set(newLine.id!);
      // Select end point
      // We need to find new index of line
      // It's either last, or we need to look it up.
      // Since `linesStore` update is async/reactive, we might not have it immediately in `lines` variable here
      // unless we force update or look at what we pushed.
      // But we are inside the component so `lines` is reactive prop. It won't update until next tick.
      // We can just set selectedLineId and let the UI handle it, or try to guess point ID.
      // Point ID depends on index.
      // Let's record change.
      recordChange();
    }
  }

  function removeSelected() {
    if (isUIElementFocused()) return;
    const sel = $selectedPointId;
    if (!sel) return;

    if (sel.startsWith("wait-")) {
      const waitId = sel.substring(5);
      const waitItem = $sequenceStore.find(
        (s) => s.kind === "wait" && (s as any).id === waitId,
      ) as any;
      if (waitItem && waitItem.locked) return; // Don't delete locked waits

      sequenceStore.update((s) =>
        s.filter((item) => !(item.kind === "wait" && item.id === waitId)),
      );
      selectedPointId.set(null);
      recordChange();
      return;
    }

    if (sel.startsWith("rotate-")) {
      const rotateId = sel.substring(7);
      const rotateItem = $sequenceStore.find(
        (s) => s.kind === "rotate" && (s as any).id === rotateId,
      ) as any;
      if (rotateItem && rotateItem.locked) return; // Don't delete locked rotates

      sequenceStore.update((s) =>
        s.filter((item) => !(item.kind === "rotate" && item.id === rotateId)),
      );
      selectedPointId.set(null);
      recordChange();
      return;
    }

    if (sel.startsWith("point-")) {
      const parts = sel.split("-");
      const lineNum = Number(parts[1]);
      const ptIdx = Number(parts[2]);
      if (lineNum === 0 && ptIdx === 0) return; // Start point

      const lineIndex = lineNum - 1;
      const line = lines[lineIndex];
      if (!line) return;

      if (ptIdx === 0) {
        // End Point -> Remove line
        if (lines.length <= 1) return;
        if (line.locked) return; // Don't allow keyboard delete of locked lines
        const removedId = line.id;
        linesStore.update((l) => l.filter((_, i) => i !== lineIndex));
        if (removedId) {
          sequenceStore.update((s) =>
            s.filter(
              (item) => !(item.kind === "path" && item.lineId === removedId),
            ),
          );
        }
        selectedPointId.set(null);
        selectedLineId.set(null);
        recordChange();
        return;
      }
      // Control Point
      const cpIndex = ptIdx - 1;
      if (line.controlPoints && line.controlPoints[cpIndex] !== undefined) {
        if (line.locked) return;
        line.controlPoints.splice(cpIndex, 1);
        linesStore.set(lines);
        selectedPointId.set(null);
        recordChange();
      }
    }
  }

  function movePoint(dx: number, dy: number) {
    if (isUIElementFocused()) return;
    const currentSel = $selectedPointId;
    if (!currentSel) return;

    // ... logic for movePoint ...
    // Since this is long, we can simplify or import helper.
    // For now I'll duplicate the logic to ensure correctness as requested "ensure everything still works"
    const defaultStep = 1;
    const snapMode = $snapToGrid && $showGrid;
    const gridStep = $gridSize || 1;
    const eps = 1e-8;

    const nextGridCoord = (current: number, direction: number) => {
      if (direction > 0)
        return Math.min(
          FIELD_SIZE,
          Math.ceil((current + eps) / gridStep) * gridStep,
        );
      else if (direction < 0)
        return Math.max(0, Math.floor((current - eps) / gridStep) * gridStep);
      return current;
    };
    const moveX = dx * defaultStep;
    const moveY = dy * defaultStep;

    if (currentSel.startsWith("point-")) {
      const parts = currentSel.split("-");
      const lineNum = Number(parts[1]);
      const ptIdx = Number(parts[2]);
      if (lineNum === 0 && ptIdx === 0) {
        if (!startPoint.locked) {
          if (snapMode) {
            if (dx !== 0) startPoint.x = nextGridCoord(startPoint.x, dx);
            if (dy !== 0) startPoint.y = nextGridCoord(startPoint.y, dy);
          } else {
            startPoint.x = Math.max(
              0,
              Math.min(FIELD_SIZE, startPoint.x + moveX),
            );
            startPoint.y = Math.max(
              0,
              Math.min(FIELD_SIZE, startPoint.y + moveY),
            );
          }
          startPoint.x = Number(startPoint.x.toFixed(3));
          startPoint.y = Number(startPoint.y.toFixed(3));
          startPointStore.set(startPoint);
          recordChange();
        }
        return;
      }
      const lineIndex = lineNum - 1;
      const line = lines[lineIndex];
      if (line && !line.locked) {
        if (ptIdx === 0) {
          if (line.endPoint) {
            if (snapMode) {
              if (dx !== 0)
                line.endPoint.x = nextGridCoord(line.endPoint.x, dx);
              if (dy !== 0)
                line.endPoint.y = nextGridCoord(line.endPoint.y, dy);
            } else {
              line.endPoint.x = Math.max(
                0,
                Math.min(FIELD_SIZE, line.endPoint.x + moveX),
              );
              line.endPoint.y = Math.max(
                0,
                Math.min(FIELD_SIZE, line.endPoint.y + moveY),
              );
            }
            line.endPoint.x = Number(line.endPoint.x.toFixed(3));
            line.endPoint.y = Number(line.endPoint.y.toFixed(3));
            // Ensure linked lines (same-named waypoints) are updated when a point is moved via keybinds
            linesStore.set(updateLinkedWaypoints(lines, line.id!));
            recordChange();
          }
        } else {
          const cpIndex = ptIdx - 1;
          if (line.controlPoints[cpIndex]) {
            if (snapMode) {
              if (dx !== 0)
                line.controlPoints[cpIndex].x = nextGridCoord(
                  line.controlPoints[cpIndex].x,
                  dx,
                );
              if (dy !== 0)
                line.controlPoints[cpIndex].y = nextGridCoord(
                  line.controlPoints[cpIndex].y,
                  dy,
                );
            } else {
              line.controlPoints[cpIndex].x = Math.max(
                0,
                Math.min(FIELD_SIZE, line.controlPoints[cpIndex].x + moveX),
              );
              line.controlPoints[cpIndex].y = Math.max(
                0,
                Math.min(FIELD_SIZE, line.controlPoints[cpIndex].y + moveY),
              );
            }
            line.controlPoints[cpIndex].x = Number(
              line.controlPoints[cpIndex].x.toFixed(3),
            );
            line.controlPoints[cpIndex].y = Number(
              line.controlPoints[cpIndex].y.toFixed(3),
            );
            linesStore.set(lines);
            recordChange();
          }
        }
      }
    } else if (currentSel.startsWith("obstacle-")) {
      const parts = currentSel.split("-");
      const shapeIdx = Number(parts[1]);
      const vertexIdx = Number(parts[2]);
      if (shapes[shapeIdx]?.vertices[vertexIdx]) {
        const v = shapes[shapeIdx].vertices[vertexIdx];
        if (snapMode) {
          if (dx !== 0) v.x = nextGridCoord(v.x, dx);
          if (dy !== 0) v.y = nextGridCoord(v.y, dy);
        } else {
          v.x = Math.max(0, Math.min(FIELD_SIZE, v.x + moveX));
          v.y = Math.max(0, Math.min(FIELD_SIZE, v.y + moveY));
        }
        v.x = Number(v.x.toFixed(3));
        v.y = Number(v.y.toFixed(3));
        shapesStore.set(shapes);
        recordChange();
      }
    } else if (currentSel.startsWith("event-")) {
      const parts = currentSel.split("-");
      const lineIdx = Number(parts[1]);
      const evIdx = Number(parts[2]);
      const line = lines[lineIdx];
      if (line && line.eventMarkers && line.eventMarkers[evIdx]) {
        const delta = (dx + dy) * 0.01;
        let newPos = line.eventMarkers[evIdx].position + delta;
        newPos = Math.max(0, Math.min(1, newPos));
        line.eventMarkers[evIdx].position = newPos;
        linesStore.set(lines);
        recordChange();
      }
    }
  }

  function getSelectableItems() {
    const items: string[] = ["point-0-0"];
    sequence.forEach((item) => {
      if (item.kind === "path") {
        const lineIdx = lines.findIndex((l) => l.id === item.lineId);
        if (lineIdx !== -1) {
          const line = lines[lineIdx];
          line.controlPoints.forEach((_, cpIdx) =>
            items.push(`point-${lineIdx + 1}-${cpIdx + 1}`),
          );
          items.push(`point-${lineIdx + 1}-0`);
        }
      } else if (item.kind === "wait") {
        items.push(`wait-${item.id}`);
      } else if (item.kind === "rotate") {
        items.push(`rotate-${item.id}`);
      }
    });
    lines.forEach((line, lineIdx) => {
      if (line.eventMarkers)
        line.eventMarkers.forEach((_, evIdx) =>
          items.push(`event-${lineIdx}-${evIdx}`),
        );
    });
    shapes.forEach((s, sIdx) => {
      s.vertices.forEach((_, vIdx) => items.push(`obstacle-${sIdx}-${vIdx}`));
    });
    return items;
  }

  function cycleSelection(dir: number) {
    if (isUIElementFocused()) return;
    const items = getSelectableItems();
    if (items.length === 0) return;
    let current = $selectedPointId;
    let idx = items.indexOf(current || "");
    if (idx === -1) idx = 0;
    else idx = (idx + dir + items.length) % items.length;
    const newId = items[idx];
    selectedPointId.set(newId);
    if (newId.startsWith("point-")) {
      const parts = newId.split("-");
      const lineNum = Number(parts[1]);
      if (lineNum > 0) selectedLineId.set(lines[lineNum - 1].id || null);
      else selectedLineId.set(null);
    } else selectedLineId.set(null);
  }

  function modifyValue(delta: number) {
    if (isUIElementFocused()) return;
    const current = $selectedPointId;
    if (!current) return;

    if (current.startsWith("wait-")) {
      const waitId = current.substring(5);
      const item = sequence.find(
        (s) => s.kind === "wait" && s.id === waitId,
      ) as any;
      if (item) {
        if (item.locked) return; // Don't modify locked waits
        item.durationMs = Math.max(0, item.durationMs + delta * 100);
        // Update linked waits so waits that share a name keep the same duration
        sequenceStore.set(updateLinkedWaits(sequence, item.id));
        recordChange();
      }
      return;
    }
    if (current.startsWith("rotate-")) {
      const rotateId = current.substring(7);
      const item = sequence.find(
        (s) => s.kind === "rotate" && s.id === rotateId,
      ) as any;
      if (item) {
        if (item.locked) return; // Don't modify locked rotates
        const step = 5;
        item.degrees = Number((item.degrees + delta * step).toFixed(2));
        sequenceStore.set(updateLinkedRotations(sequence, item.id));
        recordChange();
      }
      return;
    }
    if (current.startsWith("event-")) {
      const parts = current.split("-");
      const lineIdx = Number(parts[1]);
      const evIdx = Number(parts[2]);
      const line = lines[lineIdx];
      if (line && line.eventMarkers && line.eventMarkers[evIdx]) {
        if (line.locked) return; // Don't modify event markers on locked lines
        const step = 0.01 * Math.sign(delta);
        let newPos = line.eventMarkers[evIdx].position + step;
        newPos = Math.max(0, Math.min(1, newPos));
        line.eventMarkers[evIdx].position = newPos;
        linesStore.set(lines);
        recordChange();
      }
      return;
    }
    // Modify last event if line selected
    if ($selectedLineId) {
      const line = lines.find((l) => l.id === $selectedLineId);
      if (line && line.eventMarkers && line.eventMarkers.length > 0) {
        if (line.locked) return; // Don't modify event markers on locked lines
        const lastIdx = line.eventMarkers.length - 1;
        const step = 0.01 * Math.sign(delta);
        let newPos = line.eventMarkers[lastIdx].position + step;
        newPos = Math.max(0, Math.min(1, newPos));
        line.eventMarkers[lastIdx].position = newPos;
        linesStore.set(lines);
        recordChange();
      }
    }
  }

  function toggleHeadingMode() {
    if (isUIElementFocused()) return;
    const sel = $selectedPointId;
    if (!sel || !sel.startsWith("point-")) return;

    const parts = sel.split("-");
    const lineNum = Number(parts[1]);
    const ptIdx = Number(parts[2]);

    // Only Start Point (lineNum=0, ptIdx=0) and Line End Points (ptIdx=0) have heading modes
    if (lineNum === 0 && ptIdx === 0) {
      if (startPoint.locked) return;
      // Cycle: tangential -> constant -> linear
      const modes = ["tangential", "constant", "linear"];
      const current = startPoint.heading;
      const next = modes[(modes.indexOf(current) + 1) % modes.length];

      // Update start point structure based on new mode
      // @ts-ignore - Explicitly constructing union types
      if (next === "tangential") {
        startPointStore.set({
          ...startPoint,
          heading: "tangential",
          reverse: false,
          degrees: undefined,
          startDeg: undefined,
          endDeg: undefined,
        });
      } else if (next === "constant") {
        // @ts-ignore
        startPointStore.set({
          ...startPoint,
          heading: "constant",
          degrees: 0,
          reverse: undefined,
          startDeg: undefined,
          endDeg: undefined,
        });
      } else {
        // @ts-ignore
        startPointStore.set({
          ...startPoint,
          heading: "linear",
          startDeg: 90,
          endDeg: 180,
          reverse: undefined,
          degrees: undefined,
        });
      }
      recordChange();
      return;
    }

    if (lineNum > 0 && ptIdx === 0) {
      const lineIndex = lineNum - 1;
      const line = lines[lineIndex];
      if (!line || line.locked) return;

      const modes = ["tangential", "constant", "linear"];
      const current = line.endPoint.heading;
      const next = modes[(modes.indexOf(current) + 1) % modes.length];

      // @ts-ignore
      if (next === "tangential") {
        line.endPoint = {
          ...line.endPoint,
          heading: "tangential",
          reverse: false,
          degrees: undefined,
          startDeg: undefined,
          endDeg: undefined,
        };
      } else if (next === "constant") {
        // @ts-ignore
        line.endPoint = {
          ...line.endPoint,
          heading: "constant",
          degrees: 0,
          reverse: undefined,
          startDeg: undefined,
          endDeg: undefined,
        };
      } else {
        // @ts-ignore
        line.endPoint = {
          ...line.endPoint,
          heading: "linear",
          startDeg: 90,
          endDeg: 180,
          reverse: undefined,
          degrees: undefined,
        };
      }
      linesStore.set(lines);
      recordChange();
    }
  }

  function toggleReverse() {
    if (isUIElementFocused()) return;
    const sel = $selectedPointId;
    if (!sel || !sel.startsWith("point-")) return;

    const parts = sel.split("-");
    const lineNum = Number(parts[1]);
    const ptIdx = Number(parts[2]);

    if (lineNum === 0 && ptIdx === 0) {
      if (startPoint.locked) return;
      if (startPoint.heading === "tangential") {
        startPointStore.set({
          ...startPoint,
          reverse: !startPoint.reverse,
        });
        recordChange();
      }
      return;
    }

    if (lineNum > 0 && ptIdx === 0) {
      const lineIndex = lineNum - 1;
      const line = lines[lineIndex];
      if (!line || line.locked) return;

      if (line.endPoint.heading === "tangential") {
        line.endPoint.reverse = !line.endPoint.reverse;
        linesStore.set(lines);
        recordChange();
      }
    }
  }

  function toggleLock() {
    if (isUIElementFocused()) return;
    const sel = $selectedPointId;
    if (!sel) return;

    if (sel.startsWith("wait-")) {
      const waitId = sel.substring(5);
      sequenceStore.update((seq) =>
        seq.map((s) => {
          if (s.kind === "wait" && (s as any).id === waitId) {
            return { ...s, locked: !(s as any).locked };
          }
          return s;
        }),
      );
      recordChange();
      return;
    }

    if (sel.startsWith("rotate-")) {
      const rotateId = sel.substring(7);
      sequenceStore.update((seq) =>
        seq.map((s) => {
          if (s.kind === "rotate" && (s as any).id === rotateId) {
            return { ...s, locked: !(s as any).locked };
          }
          return s;
        }),
      );
      recordChange();
      return;
    }

    if (sel.startsWith("point-")) {
      const parts = sel.split("-");
      const lineNum = Number(parts[1]);

      if (lineNum === 0) {
        startPointStore.update((p) => ({ ...p, locked: !p.locked }));
        recordChange();
        return;
      }

      const lineIndex = lineNum - 1;
      linesStore.update((l) => {
        const newLines = [...l];
        if (newLines[lineIndex]) {
          newLines[lineIndex] = {
            ...newLines[lineIndex],
            locked: !newLines[lineIndex].locked,
          };
        }
        return newLines;
      });
      recordChange();
      return;
    }

    if ($selectedLineId) {
      linesStore.update((l) => {
        const newLines = [...l];
        const idx = newLines.findIndex((line) => line.id === $selectedLineId);
        if (idx !== -1) {
          newLines[idx] = {
            ...newLines[idx],
            locked: !newLines[idx].locked,
          };
        }
        return newLines;
      });
      recordChange();
    }
  }

  function cycleGridSize() {
    const options = [1, 3, 6, 12, 24];
    const current = $gridSize || options[0];
    const idx = options.indexOf(current);
    const next = options[(idx + 1) % options.length];
    gridSize.set(next);
  }

  function cycleGridSizeReverse() {
    const options = [1, 3, 6, 12, 24];
    const current = $gridSize || options[0];
    const idx = options.indexOf(current);
    const prev = options[(idx - 1 + options.length) % options.length];
    gridSize.set(prev);
  }

  function modifyZoom(delta: number) {
    if (isUIElementFocused()) return;
    fieldZoom.update((z) => {
      // Use adaptive step: when zooming in past 1x, speed up
      const step = computeZoomStep(z, Math.sign(delta));
      const change = Math.sign(delta) * step;
      return Math.max(0.1, Math.min(5.0, Number((z + change).toFixed(2))));
    });
  }

  function resetZoom() {
    if (isUIElementFocused()) return;
    fieldZoom.set(1.0);
    fieldPan.set({ x: 0, y: 0 });
  }

  function changePlaybackSpeedBy(delta: number) {
    const clamped = Math.max(
      0.25,
      Math.min(3.0, Math.round((playbackSpeed + delta) * 100) / 100),
    );
    playbackSpeedStore.set(clamped);
    if (delta !== 0) play();
  }
  function resetPlaybackSpeed() {
    playbackSpeedStore.set(1.0);
  }

  // --- New Capabilities ---

  function snapSelection() {
    const sel = $selectedPointId;
    if (!sel || !sel.startsWith("point-")) return;
    const gridStep = $gridSize || 1;

    const snap = (v: number) => Math.round(v / gridStep) * gridStep;

    const parts = sel.split("-");
    const lineNum = Number(parts[1]);
    const ptIdx = Number(parts[2]);

    if (lineNum === 0 && ptIdx === 0) {
      if (startPoint.locked) return;
      startPointStore.update((p) => ({
        ...p,
        x: snap(p.x),
        y: snap(p.y),
      }));
      recordChange();
      return;
    }

    const lineIdx = lineNum - 1;
    const line = lines[lineIdx];
    if (!line || line.locked) return;

    if (ptIdx === 0) {
      linesStore.update((l) => {
        const newLines = [...l];
        newLines[lineIdx].endPoint.x = snap(newLines[lineIdx].endPoint.x);
        newLines[lineIdx].endPoint.y = snap(newLines[lineIdx].endPoint.y);
        return newLines;
      });
      recordChange();
    } else {
      const cpIdx = ptIdx - 1;
      if (line.controlPoints[cpIdx]) {
        linesStore.update((l) => {
          const newLines = [...l];
          newLines[lineIdx].controlPoints[cpIdx].x = snap(
            newLines[lineIdx].controlPoints[cpIdx].x,
          );
          newLines[lineIdx].controlPoints[cpIdx].y = snap(
            newLines[lineIdx].controlPoints[cpIdx].y,
          );
          return newLines;
        });
        recordChange();
      }
    }
  }

  function resetStartPoint() {
    if (startPoint.locked) return;
    const def = getDefaultStartPoint();
    startPointStore.set(def);
    recordChange();
  }

  function panToStart() {
    if (fieldRenderer && fieldRenderer.panToField) {
      fieldRenderer.panToField(startPoint.x, startPoint.y);
    } else {
      // Fallback
      resetZoom();
    }
  }

  function panToEnd() {
    if (lines.length > 0) {
      const lastLineIdx = lines.length - 1;
      const endPoint = lines[lastLineIdx].endPoint;
      if (fieldRenderer && fieldRenderer.panToField) {
        fieldRenderer.panToField(endPoint.x, endPoint.y);
      } else {
        // Fallback
        selectedPointId.set(`point-${lastLineIdx + 1}-0`);
        selectedLineId.set(lines[lastLineIdx].id!);
      }
    }
  }

  function panView(dx: number, dy: number) {
    if (isUIElementFocused()) return;
    fieldPan.update((p) => ({ x: p.x + dx, y: p.y + dy }));
  }

  function selectFirst() {
    if (lines.length > 0) {
      selectedPointId.set(`point-0-0`);
      selectedLineId.set(null);
    }
  }

  function selectLast() {
    if (lines.length > 0) {
      const lastLineIdx = lines.length - 1;
      selectedPointId.set(`point-${lastLineIdx + 1}-0`);
      selectedLineId.set(lines[lastLineIdx].id!);
    }
  }

  function copyPathJson() {
    const data = {
      startPoint,
      lines,
      shapes,
    };
    navigator.clipboard
      .writeText(JSON.stringify(data, null, 2))
      .then(() => alert("Path data copied to clipboard!"))
      .catch((err) => console.error("Failed to copy", err));
  }

  function cycleFieldMap() {
    settingsStore.update((s) => {
      const current = s.fieldMap;
      const idx = AVAILABLE_FIELD_MAPS.findIndex((m) => m.value === current);
      const nextIdx = (idx + 1) % AVAILABLE_FIELD_MAPS.length;
      const nextMap = AVAILABLE_FIELD_MAPS[idx === -1 ? 0 : nextIdx].value;
      return { ...s, fieldMap: nextMap };
    });
  }

  function rotateField() {
    settingsStore.update((s) => {
      const current = s.fieldRotation || 0;
      const next = (current + 90) % 360;
      return { ...s, fieldRotation: next };
    });
  }

  function toggleContinuousValidation() {
    settingsStore.update((s) => ({
      ...s,
      continuousValidation: !s.continuousValidation,
    }));
  }

  function toggleOnionCurrentPath() {
    settingsStore.update((s) => ({
      ...s,
      onionSkinCurrentPathOnly: !s.onionSkinCurrentPathOnly,
    }));
  }

  // --- Registration ---

  // Create map of actionId -> handler
  $: actions = {
    saveProject: () => saveProject(),
    saveFileAs: () => saveFileAs(),
    exportGif: () => exportGif(),
    addNewLine: () => addNewLine(),
    addWait: () => addWait(),
    addRotate: () => addRotate(),
    addEventMarker: () => addEventMarker(),
    addControlPoint: () => addControlPoint(),
    removeControlPoint: () => removeControlPoint(),
    duplicate: () => duplicate(),
    copy: () => copy(),
    cut: () => cut(),
    paste: () => paste(),
    removeSelected: () => removeSelected(),
    undo: () => undoAction(),
    redo: () => redoAction(),
    resetAnimation: () => resetAnimation(),
    stepForward: () => stepForward(),
    stepBackward: () => stepBackward(),
    movePointUp: () => movePoint(0, 1),
    movePointDown: () => movePoint(0, -1),
    movePointLeft: () => movePoint(-1, 0),
    movePointRight: () => movePoint(1, 0),
    selectNext: () => cycleSelection(1),
    selectPrev: () => cycleSelection(-1),
    increaseValue: () => modifyValue(1),
    decreaseValue: () => modifyValue(-1),
    toggleHeadingMode: () => toggleHeadingMode(),
    toggleReverse: () => toggleReverse(),
    toggleLock: () => toggleLock(),
    toggleOnion: () =>
      settingsStore.update((s) => ({
        ...s,
        showOnionLayers: !s.showOnionLayers,
      })),
    toggleGrid: () => showGrid.update((v) => !v),
    cycleGridSize: () => cycleGridSize(),
    cycleGridSizeReverse: () => cycleGridSizeReverse(),
    toggleSnap: () => snapToGrid.update((v) => !v),
    zoomIn: () => modifyZoom(0.1),
    zoomOut: () => modifyZoom(-0.1),
    zoomReset: () => resetZoom(),
    increasePlaybackSpeed: () => changePlaybackSpeedBy(0.25),
    decreasePlaybackSpeed: () => changePlaybackSpeedBy(-0.25),
    resetPlaybackSpeed: () => resetPlaybackSpeed(),
    toggleProtractor: () => showProtractor.update((v) => !v),
    optimizeStart: () => {
      if (controlTabRef?.openAndStartOptimization)
        controlTabRef.openAndStartOptimization();
    },
    optimizeStop: () => {
      if (controlTabRef?.getOptimizationStatus?.().isRunning)
        controlTabRef.stopOptimization();
    },
    optimizeApply: () => {
      const status = controlTabRef?.getOptimizationStatus?.();
      if (status?.optimizedLines && !status.optimizationFailed)
        controlTabRef.applyOptimization();
    },
    optimizeDiscard: () => {
      const status = controlTabRef?.getOptimizationStatus?.();
      if (status?.optimizedLines || status?.optimizationFailed)
        controlTabRef.discardOptimization();
    },
    optimizeRetry: () => {
      const status = controlTabRef?.getOptimizationStatus?.();
      if (
        !status?.isRunning &&
        (status?.optimizedLines || status?.optimizationFailed)
      )
        controlTabRef.retryOptimization();
    },
    selectTabPaths: () => (activeControlTab = "path"),
    selectTabField: () => (activeControlTab = "field"),
    selectTabTable: () => (activeControlTab = "table"),
    cycleTabNext: () => {
      if (activeControlTab === "path") activeControlTab = "field";
      else if (activeControlTab === "field") activeControlTab = "table";
      else activeControlTab = "path";
    },
    cycleTabPrev: () => {
      if (activeControlTab === "path") activeControlTab = "table";
      else if (activeControlTab === "field") activeControlTab = "path";
      else activeControlTab = "field";
    },
    toggleCollapseAll: () => toggleCollapseAllTrigger.update((v) => v + 1),
    toggleCollapseSelected: () => {
      if (isUIElementFocused()) return;
      if (controlTabRef && controlTabRef.toggleCollapseSelected) {
        controlTabRef.toggleCollapseSelected();
      }
    },
    showHelp: () => showShortcuts.update((v) => !v),
    openSettings: () => showSettings.update((v) => !v),
    openWhatsNew: () => {
      if (openWhatsNew) openWhatsNew();
    },
    toggleCommandPalette: () => {
      if (toggleCommandPalette)
        toggleCommandPalette(); // external override?
      else showCommandPalette = !showCommandPalette; // internal toggle
    },
    toggleStats: () => {
      if (toggleStats) toggleStats();
    },
    toggleSidebar: () => {
      if (toggleSidebar) toggleSidebar();
    },
    togglePresentationMode: () => isPresentationMode.update((v) => !v),
    toggleVelocityHeatmap: () =>
      settingsStore.update((s) => ({
        ...s,
        showVelocityHeatmap: !s.showVelocityHeatmap,
      })),
    addObstacle: () => {
      shapesStore.update((s) => [...s, createTriangle(s.length)]);
      activeControlTab = "field";
    },
    focusName: () => {
      const sel = $selectedPointId || $selectedLineId;
      if (sel) {
        focusRequest.set({
          field: "name",
          timestamp: Date.now(),
          id: sel,
        });
      }
    },
    deselectAll: () => {
      selectedPointId.set(null);
      selectedLineId.set(null);
    },
    focusX: () => focusRequest.set({ field: "x", timestamp: Date.now() }),
    focusY: () => focusRequest.set({ field: "y", timestamp: Date.now() }),
    focusHeading: () =>
      focusRequest.set({ field: "heading", timestamp: Date.now() }),
    togglePlay: () => {
      if (playing) pause();
      else play();
    },
    openFile: () => {
      if (fileInput) fileInput.click();
    },
    newProject: () => {
      resetProject();
    },
    toggleFileManager: () => {
      showFileManager.update((v) => !v);
    },
    exportJava: () => exportDialogState.set({ isOpen: true, format: "java" }),
    exportPoints: () =>
      exportDialogState.set({ isOpen: true, format: "points" }),
    exportSequential: () =>
      exportDialogState.set({ isOpen: true, format: "sequential" }),
    exportPP: () => exportDialogState.set({ isOpen: true, format: "json" }),
    // New Actions
    moveItemUp: () => {
      const idx = getSelectedSequenceIndex();
      if (idx !== null && controlTabRef && controlTabRef.moveSequenceItem) {
        controlTabRef.moveSequenceItem(idx, -1);
      }
    },
    moveItemDown: () => {
      const idx = getSelectedSequenceIndex();
      if (idx !== null && controlTabRef && controlTabRef.moveSequenceItem) {
        controlTabRef.moveSequenceItem(idx, 1);
      }
    },
    addPathAtStart: () => {
      if (controlTabRef && controlTabRef.addPathAtStart)
        controlTabRef.addPathAtStart();
    },
    addWaitAtStart: () => {
      if (controlTabRef && controlTabRef.addWaitAtStart)
        controlTabRef.addWaitAtStart();
    },
    addRotateAtStart: () => {
      if (controlTabRef && controlTabRef.addRotateAtStart)
        controlTabRef.addRotateAtStart();
    },
    validatePath: () => {
      validatePath(startPoint, lines, settings, sequence, shapes);
    },
    clearObstacles: () => {
      shapesStore.set([]);
      recordChange();
    },
    snapSelection: () => snapSelection(),
    resetStartPoint: () => resetStartPoint(),
    panToStart: () => panToStart(),
    panToEnd: () => panToEnd(),
    panViewUp: () => panView(0, 50),
    panViewDown: () => panView(0, -50),
    panViewLeft: () => panView(50, 0),
    panViewRight: () => panView(-50, 0),
    selectLast: () => selectLast(),
    selectFirst: () => selectFirst(),
    copyPathJson: () => copyPathJson(),
    toggleDebugSequence: () =>
      settingsStore.update((s) => ({
        ...s,
        showDebugSequence: !(s as any).showDebugSequence,
      })),
    toggleFieldBoundaries: () =>
      settingsStore.update((s) => ({
        ...s,
        validateFieldBoundaries: !s.validateFieldBoundaries,
      })),
    toggleDragRestriction: () =>
      settingsStore.update((s) => ({
        ...s,
        restrictDraggingToField: !s.restrictDraggingToField,
      })),
    setTheme: (theme: any) => settingsStore.update((s) => ({ ...s, theme })),
    setAutosave: (mode: any, interval?: any) => {
      if (mode === "never")
        settingsStore.update((s) => ({ ...s, autosaveMode: "never" }));
      else if (mode === "time")
        settingsStore.update((s) => ({
          ...s,
          autosaveMode: "time",
          autosaveInterval: interval,
        }));
      else if (mode === "change")
        settingsStore.update((s) => ({ ...s, autosaveMode: "change" }));
      else if (mode === "close")
        settingsStore.update((s) => ({ ...s, autosaveMode: "close" }));
    },
    openDocs: () => {
      if (openWhatsNew) openWhatsNew();
    },
    reportIssue: () => {
      const url = "https://github.com/Mallen220/PedroPathingVisualizer/issues";
      // @ts-ignore
      if (window.electronAPI && window.electronAPI.openExternal) {
        // @ts-ignore
        window.electronAPI.openExternal(url);
      } else {
        window.open(url, "_blank");
      }
    },
    setFileManagerDirectory: async () => {
      if (window.electronAPI && window.electronAPI.setDirectory) {
        await window.electronAPI.setDirectory();
        // Optionally refresh files after setting directory
        fetchFiles();
      }
    },
    resetKeybinds: () => {
      if (
        confirm(
          "Reset all key bindings to defaults? This will overwrite any custom key bindings.",
        )
      ) {
        settingsStore.update((s) => ({
          ...s,
          keyBindings: DEFAULT_KEY_BINDINGS.map((b) => ({ ...b })),
        }));
      }
    },
    resetSettings: () => {
      settingsStore.set(JSON.parse(JSON.stringify(DEFAULT_SETTINGS)));
    },
    cycleTheme: () => {
      settingsStore.update((s) => {
        const themes: ("light" | "dark" | "auto")[] = ["light", "dark", "auto"];
        const currentIndex = themes.indexOf(s.theme as any);
        const nextIndex = (currentIndex + 1) % themes.length;
        return { ...s, theme: themes[nextIndex] };
      });
    },
    setThemeLight: () => (actions as any).setTheme("light"),
    setThemeDark: () => (actions as any).setTheme("dark"),
    setAutoSaveNever: () => (actions as any).setAutosave("never"),
    setAutoSave1m: () => (actions as any).setAutosave("time", 1),
    setAutoSave5m: () => (actions as any).setAutosave("time", 5),
    setAutoSaveChange: () => (actions as any).setAutosave("change"),
    setAutoSaveClose: () => (actions as any).setAutosave("close"),
    startTutorial: () => {
      import("../../stores").then(({ startTutorial }) => {
        startTutorial.set(true);
      });
    },
    toggleDiff: () => toggleDiff(),
    togglePluginManager: () => showPluginManager.update((v) => !v),
    toggleRuler: () => showRuler.update((v) => !v),
    cycleFieldMap: () => cycleFieldMap(),
    rotateField: () => rotateField(),
    toggleContinuousValidation: () => toggleContinuousValidation(),
    toggleOnionCurrentPath: () => toggleOnionCurrentPath(),
  };

  // --- Derived Commands for Search ---
  $: lineCommands = lines.map((l, i) => ({
    id: `cmd-line-${l.id}`,
    label: l.name ? `Path: ${l.name}` : `Path ${i + 1}`,
    category: "Path Segment",
    action: () => {
      selectedLineId.set(l.id || null);
      const idx = lines.findIndex((ln) => ln.id === l.id);
      if (idx !== -1) {
        selectedPointId.set(`point-${idx + 1}-0`);
      }

      if (controlTabRef && controlTabRef.scrollToItem) {
        controlTabRef.scrollToItem("path", l.id || "");
      }
    },
  }));

  $: waitCommands = sequence
    .filter((s) => s.kind === "wait")
    .map((s: any) => ({
      id: `cmd-wait-${s.id}`,
      label: s.name ? `Wait: ${s.name}` : "Wait",
      category: "Wait",
      action: () => {
        selectedPointId.set(`wait-${s.id}`);
        selectedLineId.set(null);
        if (controlTabRef && controlTabRef.scrollToItem) {
          controlTabRef.scrollToItem("wait", s.id);
        }
      },
    }));

  $: rotateCommands = sequence
    .filter((s) => s.kind === "rotate")
    .map((s: any) => ({
      id: `cmd-rotate-${s.id}`,
      label: s.name ? `Rotate: ${s.name}` : "Rotate",
      category: "Rotate",
      action: () => {
        selectedPointId.set(`rotate-${s.id}`);
        selectedLineId.set(null);
        if (controlTabRef && controlTabRef.scrollToItem) {
          controlTabRef.scrollToItem("rotate", s.id);
        }
      },
    }));

  $: eventCommands = (() => {
    const cmds: any[] = [];

    lines.forEach((l, lIdx) => {
      if (l.eventMarkers) {
        l.eventMarkers.forEach((m) => {
          cmds.push({
            id: `cmd-event-${m.id}`,
            label: m.name ? `Event: ${m.name}` : `Event (Path ${lIdx + 1})`,
            category: "Event Marker",
            action: () => {
              if (controlTabRef && controlTabRef.scrollToItem) {
                controlTabRef.scrollToItem("event", m.id);
              }
            },
          });
        });
      }
    });

    sequence.forEach((s) => {
      if (s.kind === "wait" || s.kind === "rotate") {
        const item = s as any;
        if (item.eventMarkers) {
          item.eventMarkers.forEach((m: any) => {
            cmds.push({
              id: `cmd-event-${m.id}`,
              label: m.name
                ? `Event: ${m.name}`
                : `Event (${s.kind === "wait" ? "Wait" : "Rotate"})`,
              category: "Event Marker",
              action: () => {
                if (controlTabRef && controlTabRef.scrollToItem) {
                  controlTabRef.scrollToItem("event", m.id);
                }
              },
            });
          });
        }
      }
    });
    return cmds;
  })();

  // Derive commands list for Command Palette
  $: paletteCommands = [
    ...(settings?.keyBindings || DEFAULT_KEY_BINDINGS)
      .filter((b) => (actions as any)[b.action])
      .map((b) => ({
        id: b.id,
        label: b.description,
        shortcut: b.key,
        category: b.category,
        action: (actions as any)[b.action],
      })),
    ...fileCommands,
    ...lineCommands,
    ...waitCommands,
    ...rotateCommands,
    ...eventCommands,
  ];

  $: if (settings && settings.keyBindings) {
    hotkeys.unbind();

    // Bind all actions defined in settings
    settings.keyBindings.forEach((binding) => {
      const handler = (actions as any)[binding.action];
      if (handler && binding.key) {
        hotkeys(binding.key, (e) => {
          if (shouldBlockShortcut(e)) return;
          e.preventDefault();
          handler(e);
        });
      }
    });

    // Special case for Play/Pause toggle which is mapped to 'togglePlay' action
    // but the ID in defaults is 'play-pause' and action is 'togglePlay'.
    // The loop above covers it if keyBinding is correct.
  }
</script>

<CommandPalette
  isOpen={showCommandPalette}
  onClose={() => (showCommandPalette = false)}
  commands={paletteCommands}
/>

<!-- Hidden file input for Open File shortcut -->
<input
  bind:this={fileInput}
  type="file"
  accept=".pp"
  class="hidden"
  style="display:none;"
  on:change={(e) => {
    // @ts-ignore
    if (e.target.files && e.target.files.length > 0) {
      loadFile(e);
      // Reset value so we can load the same file again if needed
      // @ts-ignore
      e.target.value = "";
    }
  }}
/>

<!-- No UI for shortcuts themselves, just listeners -->
