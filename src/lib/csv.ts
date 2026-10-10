/** RFC 4180 CSV: quote every cell, double any quotes inside. */
export const toCsv = (rows: (string | number | undefined)[][]) =>
  rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");

/** Saves rows as a .csv file. The BOM makes Excel read UTF-8 (e.g. "–" in names). */
export function downloadCsv(filename: string, rows: (string | number | undefined)[][]) {
  const url = URL.createObjectURL(new Blob(["﻿" + toCsv(rows)], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}
