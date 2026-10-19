// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Shared by the file manager's grid and list views.
import { tick } from "svelte";
import type { FileInfo, Line, Point } from "../../../types";
import { getElectronAPI } from "../../../utils/platform";

type PathPreview = { startPoint: Point; lines: Line[] };

const BATCH_SIZE = 3;
const MAX_RETRIES = 5;

/**
 * Reads project files in the background so thumbnails can show their paths.
 * Files are read a few at a time to keep the UI responsive. A file that
 * can't be read (for example because it is still being written) is retried
 * a few times with increasing delays.
 */
class PreviewLoader {
  /** Previews by file path. `null` means the file couldn't be read. */
  previews: Record<string, PathPreview | null> = $state({});

  #queue: string[] = [];
  // Queued or being read right now.
  #pending = new Set<string>();
  #running = false;
  #attempts: Record<string, number> = {};

  /** Starts loading a preview unless it is loaded, failed or queued already. */
  load(path: string) {
    if (path in this.previews || this.#pending.has(path)) return;
    this.#pending.add(path);
    this.#queue.push(path);
    void this.#run();
  }

  /** Throws away any cached preview and reads the file again. */
  reload(path: string) {
    delete this.previews[path];
    this.#attempts[path] = 0;
    this.load(path);
  }

  forget(path: string) {
    delete this.previews[path];
    delete this.#attempts[path];
  }

  reloadFailed() {
    for (const [path, preview] of Object.entries(this.previews)) {
      if (preview === null) this.reload(path);
    }
  }

  async #run() {
    if (this.#running) return;
    this.#running = true;
    try {
      while (this.#queue.length > 0) {
        const batch = this.#queue.splice(0, BATCH_SIZE);
        await Promise.all(batch.map((path) => this.#read(path)));
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    } finally {
      this.#running = false;
    }
  }

  async #read(path: string) {
    try {
      await this.#readFile(path);
    } finally {
      this.#pending.delete(path);
    }
  }

  async #readFile(path: string) {
    try {
      const data = JSON.parse((await getElectronAPI()?.readFile(path)) ?? "");
      if (data.startPoint && Array.isArray(data.lines)) {
        this.previews[path] = {
          startPoint: data.startPoint,
          lines: data.lines,
        };
        this.#attempts[path] = 0;
        return;
      }
    } catch {
      // Unreadable or not JSON; handled below.
    }
    this.#retryLater(path);
  }

  #retryLater(path: string) {
    const attempt = (this.#attempts[path] ?? 0) + 1;
    this.#attempts[path] = attempt;
    this.previews[path] = null;
    if (attempt > MAX_RETRIES) return;

    setTimeout(
      () => {
        delete this.previews[path];
        this.load(path);
      },
      1000 * Math.min(4, attempt),
    );
  }
}

export const filePreviews = new PreviewLoader();

// One observer for every thumbnail: a preview is loaded when its file
// scrolls near the visible area.
const observedPaths = new Map<Element, string>();
let visibilityObserver: IntersectionObserver | null = null;

function getVisibilityObserver() {
  visibilityObserver ??= new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const path = observedPaths.get(entry.target);
        if (!entry.isIntersecting || !path) continue;
        filePreviews.load(path);
        visibilityObserver?.unobserve(entry.target);
      }
    },
    { rootMargin: "200px", threshold: 0.05 },
  );
  return visibilityObserver;
}

/** Svelte action: load `file`'s preview once its element is nearly on screen. */
export function loadPreviewWhenVisible(node: HTMLElement, file: FileInfo) {
  const watch = (f: FileInfo) => {
    getVisibilityObserver().unobserve(node);
    observedPaths.delete(node);
    if (f.isDirectory) return;
    observedPaths.set(node, f.path);
    getVisibilityObserver().observe(node);
  };
  watch(file);
  return {
    update: watch,
    destroy() {
      visibilityObserver?.unobserve(node);
      observedPaths.delete(node);
    },
  };
}

/** Svelte action: select the input's text when it appears. */
export function selectOnMount(node: HTMLInputElement) {
  void tick().then(() => node.select());
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${Number.parseFloat((bytes / Math.pow(1024, i)).toFixed(2))} ${units[i]}`;
}

function daysAgo(date: Date): number {
  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((startOfDay(new Date()) - startOfDay(date)) / 86_400_000);
}

export const isToday = (date: Date) => daysAgo(date) === 0;

export type FileGroup = { title: string; files: FileInfo[] };

/** Folders first, then files modified today, yesterday and earlier. */
export function groupFilesByDate(files: FileInfo[]): FileGroup[] {
  const groups: FileGroup[] = [
    { title: "Folders", files: [] },
    { title: "Today", files: [] },
    { title: "Yesterday", files: [] },
    { title: "Older", files: [] },
  ];
  for (const f of files) {
    if (f.isDirectory) groups[0].files.push(f);
    else {
      const age = daysAgo(new Date(f.modified));
      groups[age === 0 ? 1 : age === 1 ? 2 : 3].files.push(f);
    }
  }
  return groups.filter((g) => g.files.length > 0);
}

/** The name shown in the rename box: the file name without its extension. */
export const renameableName = (file: FileInfo) =>
  file.name.replaceAll(/\.(pp|turt|java)$/gi, "");

/**
 * Puts a file on a drag event so it can be dropped onto the path list (as a
 * macro) or onto a folder in the file manager.
 */
export function setDraggedFile(e: DragEvent, file: FileInfo) {
  if (!e.dataTransfer) return;
  e.dataTransfer.setData("application/x-turtle-tracer-macro", file.path);
  e.dataTransfer.setData("application/x-pedro-macro", file.path);
  e.dataTransfer.setData("text/plain", file.path);
  e.dataTransfer.setData("application/json", JSON.stringify(file));
  e.dataTransfer.effectAllowed = "copyMove";
}

/** The file being dragged, if the drag came from the file manager. */
function getDraggedFile(e: DragEvent): FileInfo | null {
  try {
    const data = e.dataTransfer?.getData("application/json");
    return data ? (JSON.parse(data) as FileInfo) : null;
  } catch (err) {
    console.error("Failed to parse dragged file data:", err);
    return null;
  }
}

/** What the file manager gives the grid and list views. */
export interface FileBrowserProps {
  files?: FileInfo[];
  selectedFilePath?: string | null;
  sortMode?: "name" | "date";
  renamingFile?: FileInfo | null;
  fieldImage?: string | null;
  showGitStatus?: boolean;
  onselect?: (file: FileInfo) => void;
  onopen?: (file: FileInfo) => void;
  onrenameStart?: (file: FileInfo) => void;
  onrenameSave?: (name: string) => void;
  onrenameCancel?: () => void;
  onmoveFile?: (data: { sourceFile: FileInfo; targetDir: FileInfo }) => void;
  /** Folders can't be renamed or deleted (in a GitHub repository). */
  lockFolders?: boolean;
  onmenuAction?: (data: { action: string; file: FileInfo }) => void;
}

/** The sections a view shows: grouped by date, or all files together. */
export const fileSections = (
  files: FileInfo[],
  sortMode: "name" | "date",
): FileGroup[] =>
  sortMode === "date" ? groupFilesByDate(files) : [{ title: "Files", files }];

/**
 * What the grid and list views do with the mouse and keyboard: the context
 * menu, renaming and dropping a file onto a folder. Create it while the view
 * is being set up; `props` returns the view's current props.
 */
export class FileBrowserState {
  contextMenu: { x: number; y: number; file: FileInfo } | null = $state(null);
  /** The name being typed in the rename box. */
  renameInput = $state("");
  /** The folder a file is being dragged over. */
  dragOverTarget: string | null = $state(null);

  #props: () => FileBrowserProps;
  #lastRenamingPath: string | null = null;

  constructor(props: () => FileBrowserProps) {
    this.#props = props;

    // Start each rename from the file's current name.
    $effect(() => {
      const renaming = this.#props().renamingFile;
      if (!renaming) {
        this.#lastRenamingPath = null;
      } else if (renaming.path !== this.#lastRenamingPath) {
        this.renameInput = renameableName(renaming);
        this.#lastRenamingPath = renaming.path;
      }
    });
  }

  closeMenu = () => {
    this.contextMenu = null;
  };

  /** Opens the menu for `file` at a point on screen, selecting it. */
  openMenuAt(x: number, y: number, file: FileInfo) {
    this.contextMenu = { x, y, file };
    this.#props().onselect?.(file);
  }

  handleContextMenu = (event: MouseEvent, file: FileInfo) => {
    event.preventDefault();
    this.openMenuAt(event.clientX, event.clientY, file);
  };

  handleMenuAction = (action: string) => {
    if (!this.contextMenu) return;
    const file = this.contextMenu.file;
    this.contextMenu = null;
    if (action === "rename") this.#props().onrenameStart?.(file);
    else this.#props().onmenuAction?.({ action, file });
  };

  handleDragOver = (e: DragEvent, file: FileInfo) => {
    if (!file.isDirectory) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    this.dragOverTarget = file.path;
  };

  handleDragLeave = (_e: DragEvent, file: FileInfo) => {
    if (this.dragOverTarget === file.path) this.dragOverTarget = null;
  };

  handleDrop = (e: DragEvent, file: FileInfo) => {
    this.dragOverTarget = null;
    // Don't let the window's file-drop handler treat this as opening a file.
    e.preventDefault();
    e.stopPropagation();
    if (!file.isDirectory) return;

    const sourceFile = getDraggedFile(e);
    if (sourceFile && sourceFile.path !== file.path) {
      this.#props().onmoveFile?.({ sourceFile, targetDir: file });
    }
  };
}
