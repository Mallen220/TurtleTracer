// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import { PDFDocument } from "@cantoo/pdf-lib";
import { mergePdfs } from "./batchExport";

const pdf = async (pages: number) => {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage();
  return new Blob([await doc.save()], { type: "application/pdf" });
};

describe("mergePdfs", () => {
  it("keeps every page of every PDF", async () => {
    const merged = await PDFDocument.load(
      await (await mergePdfs([await pdf(1), await pdf(2)])).arrayBuffer(),
    );
    expect(merged.getPageCount()).toBe(3);
  });
});
