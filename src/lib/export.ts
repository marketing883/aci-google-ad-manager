/**
 * Export helpers — CSV serialization and browser-native print-to-PDF.
 *
 * PDF export strategy: rather than pulling in a heavyweight library
 * (react-pdf, pdfkit, jsPDF, puppeteer), we leverage the browser's built-in
 * print-to-PDF via `window.print()` plus a print stylesheet. This means every
 * OS shows the native print dialog where "Save as PDF" is already wired up.
 * Callers can pass a scoped selector (e.g. "#report-printable") and the
 * print CSS will hide everything else.
 */

export interface CsvColumn<T> {
  /** Column header. */
  header: string;
  /** Function to extract the cell value from a row. */
  value: (row: T) => string | number | null | undefined;
}

export function downloadCsv<T>(
  filename: string,
  columns: CsvColumn<T>[],
  rows: T[],
): void {
  const escape = (v: unknown): string => {
    if (v === null || v === undefined) return '';
    const str = String(v).replace(/"/g, '""');
    return /[",\n]/.test(str) ? `"${str}"` : str;
  };

  const csv = [
    columns.map((c) => escape(c.header)).join(','),
    ...rows.map((row) =>
      columns.map((c) => escape(c.value(row))).join(','),
    ),
  ].join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Trigger the browser's native print dialog, which allows saving as PDF on
 * every modern OS. Pair with `@media print` styles in globals.css to control
 * what gets included.
 */
export function printToPdf(): void {
  window.print();
}
