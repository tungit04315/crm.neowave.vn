import { IMPORT_COLS, parseCsv, toCsv } from './customer-io-core';

export async function readMatrix(file: File): Promise<unknown[][]> {
  if (file.size > 5 * 1024 * 1024) throw new Error('Tệp lớn hơn 5MB.');
  const n = file.name.toLowerCase();
  if (n.endsWith('.csv')) return parseCsv(await file.text());
  if (n.endsWith('.xlsx')) { const { readSheet } = await import('read-excel-file/browser'); return (await readSheet(file)) as unknown[][]; }
  throw new Error('Chỉ hỗ trợ tệp .xlsx hoặc .csv.');
}
function save(blob: Blob, name: string) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
export async function downloadXlsx(matrix: string[][], name: string) {
  const { default: write } = await import('write-excel-file/browser');
  const data = matrix.map((r, i) => r.map(c => (i === 0 ? { value: c, fontWeight: 'bold' as const } : c === '' ? null : { value: c, type: String })));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blob = await write(data as any, { columns: matrix[0].map(() => ({ width: 18 })) }).toBlob();
  save(blob, name);
}
export const downloadCsv = (matrix: string[][], name: string) => save(new Blob([toCsv(matrix)], { type: 'text/csv;charset=utf-8' }), name);
export const stamp = () => new Date().toISOString().slice(0, 10).replace(/-/g, '');
export const templateMatrix = () => [IMPORT_COLS.map(c => c.header)];
