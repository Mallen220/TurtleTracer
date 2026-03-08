// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { get } from "svelte/store";
import { diskEventNamesStore } from "../stores";
import type { Line, SequenceItem } from "../types";

export async function scanEventsInDirectory(directory: string) {
  const electronAPI = (window as any).electronAPI;
  if (!electronAPI || !electronAPI.listFiles || !electronAPI.readFile) return;

  try {
    const files = await electronAPI.listFiles(directory);
    // Filter for .pp files
    const ppFiles = files.filter((f: any) =>
      f.name.toLowerCase().endsWith(".pp"),
    );

    const eventNames = new Set<string>();

    // We process files in parallel for speed, but catch errors per file
    await Promise.all(
      ppFiles.map(async (file: any) => {
        try {
          const content = await electronAPI.readFile(file.path);
          const data = JSON.parse(content);

          // Extract from lines
          if (Array.isArray(data.lines)) {
            data.lines.forEach((line: Line) => {
              if (line.eventMarkers) {
                line.eventMarkers.forEach((m) => {
                  if (m.name && m.name.trim() !== "") {
                    eventNames.add(m.name.trim());
                  }
                });
              }
            });
          }

          // Extract from sequence (waits/rotates)
          if (Array.isArray(data.sequence)) {
            data.sequence.forEach((item: SequenceItem) => {
              if (item.kind === "wait" || item.kind === "rotate") {
                const waitOrRotate = item as any; // Cast to access eventMarkers if not in type def
                if (waitOrRotate.eventMarkers) {
                  waitOrRotate.eventMarkers.forEach((m: any) => {
                    if (m.name && m.name.trim() !== "") {
                      eventNames.add(m.name.trim());
                    }
                  });
                }
              }
            });
          }
        } catch (e) {
          console.warn(
            `Failed to parse file ${file.name} during event scan:`,
            e,
          );
        }
      }),
    );

    diskEventNamesStore.set(Array.from(eventNames).sort());
  } catch (err) {
    console.error("Error scanning events in directory:", err);
  }
}
