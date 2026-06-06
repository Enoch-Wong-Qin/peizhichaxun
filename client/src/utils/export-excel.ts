import * as XLSX from 'xlsx';
import { logger } from '@lark-apaas/client-toolkit/logger';

export function exportToExcel(
  data: Record<string, unknown>[],
  columns: string[],
  fileName: string,
): void {
  try {
    const rows = data.map((row: Record<string, unknown>) => {
      const mapped: Record<string, string> = {};
      for (const col of columns) {
        const val = row[col];
        mapped[col] = val != null ? String(val) : '';
      }
      return mapped;
    });

    const ws = XLSX.utils.json_to_sheet(rows, { header: columns });

    const colWidths = columns.map((col: string) => {
      const maxDataLen = rows.reduce((max: number, row: Record<string, string>) => {
        const len = (row[col] || '').length;
        return len > max ? len : max;
      }, col.length);
      return { wch: Math.min(Math.max(maxDataLen + 2, 8), 40) };
    });
    ws['!cols'] = colWidths;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '查询结果');
    XLSX.writeFile(wb, `${fileName}.xlsx`);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : '导出失败';
    logger.error('Excel 导出失败', { error: msg });
  }
}
