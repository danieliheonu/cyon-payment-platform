/** RFC 4180 CSV with a UTF-8 BOM so Excel shows ₦ and names correctly. Guards against formula injection. */
export function toCsv(headers: readonly string[], rows: readonly (readonly string[])[]): string {
  const lines = [headers, ...rows].map((row) => row.map(escape).join(","));
  return "﻿" + lines.join("\r\n") + "\r\n";
}

function escape(value: string): string {
  // Cells starting with = + - @ could run as formulas in spreadsheet apps.
  const safe = /^[=+\-@\t\r]/.test(value) && !/^-?\d+(\.\d+)?$/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}
