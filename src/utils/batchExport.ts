// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// "Run as Batch": exports every remaining file of an export cycle with the
// options set in the dialog, into one folder.
import { get } from "svelte/store";
import {
  batchProgress,
  currentFilePath,
  exportCycle,
  notification,
} from "../stores";
import { getElectronAPI } from "./platform";
import { endExportSwap, showCycleFile } from "./exportFromFile";
import { fileNameOf, joinPath } from "./fileHandlers";
import { stripProjectExtension } from "./fileExtensions";
import { imageToBase64 } from "./file";

export interface BatchOutput {
  /** The whole file name, or just a `suffix` to put after the project's name. */
  name?: string;
  suffix?: string;
  data: Blob | string;
}

/** What each export dialog offers: the output for the file that is open now. */
export type BatchExporter = (
  signal: AbortSignal,
  onProgress: (fraction: number) => void,
) => Promise<BatchOutput>;

/** The open project's file name without its extension, for naming outputs. */
export const projectBaseName = () =>
  stripProjectExtension(fileNameOf(get(currentFilePath) ?? "")) || "export";

let abort: AbortController | null = null;

export function cancelBatch() {
  abort?.abort();
}

/** Lets the field renderer draw the file that was just swapped in. */
const nextFrames = () =>
  new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );

function download(name: string, data: Blob | string) {
  const url = URL.createObjectURL(
    typeof data === "string" ? new Blob([data]) : data,
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** Saves into `folder` without overwriting: name.ext, then name1.ext, name2.ext... */
async function save(folder: string, name: string, data: Blob | string) {
  const api = getElectronAPI()!;
  const dot = name.lastIndexOf(".");
  const [base, ext] =
    dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
  let path = joinPath(folder, name);
  for (let n = 1; await api.fileExists?.(path); n++) {
    path = joinPath(folder, `${base}${n}${ext}`);
  }
  if (typeof data === "string") await api.writeFile(path, data);
  else {
    const url = await imageToBase64(data);
    await api.writeFileBase64!(path, url.split(",")[1]);
  }
}

/** One PDF out of several, pages in the order given. */
export async function mergePdfs(pdfs: Blob[]): Promise<Blob> {
  const { PDFDocument } = await import("@cantoo/pdf-lib");
  const merged = await PDFDocument.create();
  for (const pdf of pdfs) {
    const source = await PDFDocument.load(await pdf.arrayBuffer());
    for (const page of await merged.copyPages(source, source.getPageIndices()))
      merged.addPage(page);
  }
  return new Blob([await merged.save()], { type: "application/pdf" });
}

const PACKET_NAME = "strategy-packet.pdf";

/**
 * Exports the current file of the cycle and every one after it. Returns
 * without doing anything if no folder is chosen. `finished` closes the
 * dialog the batch was started from. With `combine`, the outputs (PDFs) are
 * merged into one file instead of saved one by one.
 */
export async function runBatch(
  exporter: BatchExporter,
  finished: () => void,
  combine = false,
) {
  const cycle = get(exportCycle);
  if (!cycle) return;

  // The browser has no folders; each file downloads instead.
  const api = getElectronAPI();
  let folder: string | null = null;
  if (api?.selectDirectory && !api.isVirtual && api.writeFileBase64) {
    folder = await api.selectDirectory();
    if (!folder) return;
  }

  const todo = cycle.files.slice(cycle.index);
  const controller = (abort = new AbortController());
  const failed: string[] = [];
  const parts: Blob[] = [];
  let exported = 0;
  for (const [i, file] of todo.entries()) {
    if (controller.signal.aborted) break;
    batchProgress.set({
      done: i,
      total: todo.length,
      name: file.name,
      fileProgress: 0,
    });
    try {
      await showCycleFile(cycle.index + i, false);
      await nextFrames();
      const out = await exporter(controller.signal, (fileProgress) =>
        batchProgress.update((b) => b && { ...b, fileProgress }),
      );
      if (combine) parts.push(out.data as Blob);
      else {
        const name = out.name ?? projectBaseName() + out.suffix;
        if (folder) await save(folder, name, out.data);
        else download(name, out.data);
      }
      exported++;
    } catch (e) {
      if (controller.signal.aborted) break;
      console.error("Batch export failed for", file.name, e);
      failed.push(file.name);
    }
  }

  if (combine && parts.length) {
    try {
      const packet = await mergePdfs(parts);
      if (folder) await save(folder, PACKET_NAME, packet);
      else download(PACKET_NAME, packet);
    } catch (e) {
      console.error("Could not combine the PDFs", e);
      failed.push(PACKET_NAME);
    }
  }

  abort = null;
  batchProgress.set(null);
  endExportSwap();
  finished();
  notification.set({
    message:
      `Exported ${exported} of ${todo.length} file${todo.length === 1 ? "" : "s"}` +
      (combine ? " into one PDF" : "") +
      (folder ? ` to ${fileNameOf(folder) || folder}` : "") +
      (controller.signal.aborted ? ". Cancelled" : "") +
      (failed.length ? `. Failed: ${failed.join(", ")}` : ""),
    type: failed.length || controller.signal.aborted ? "warning" : "success",
    timeout: 8000,
  });
}
