/** Download rows as a CSV file (client-side, no server round trip). */
export function downloadCsv<T>(filename: string, rows: readonly T[], columns: Array<[header: string, value: (row: T) => unknown]>) {
  const escape = (value: unknown) => {
    const text = value === null || value === undefined ? "" : String(value);
    return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  const lines = [columns.map(([header]) => escape(header)).join(",")];
  for (const row of rows) lines.push(columns.map(([, read]) => escape(read(row))).join(","));
  const blob = new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
