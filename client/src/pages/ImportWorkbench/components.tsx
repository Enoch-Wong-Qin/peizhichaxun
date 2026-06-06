import React from 'react';
import CountUp from 'react-countup';
import * as XLSX from 'xlsx';
import {
  CheckCircle2,
  AlertCircle,
  Loader2,
  Clock,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import type { ChunkStatus } from '@shared/import';

export const CHUNK_SIZE_THRESHOLD = 256 * 1024;

export interface ChunkInfo {
  chunkNo: number;
  rowCount: number;
  size: number;
  data: Record<string, unknown>[];
  status: ChunkStatus;
  errorMsg?: string;
}

export interface ParsedFile {
  id: string;
  name: string;
  totalSize: number;
  totalRows: number;
  columns: string[];
  chunks: ChunkInfo[];
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const StatCard: React.FC<{
  label: string;
  value: number;
  icon: React.ReactNode;
  suffix?: string;
  isTime?: boolean;
}> = ({ label, value, icon, suffix, isTime }) => (
  <Card className="bg-card">
    <CardContent className="p-5">
      <div className="flex items-center gap-3">
        <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-accent flex items-center justify-center text-primary">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-muted-foreground truncate">{label}</p>
          <p className="text-2xl font-bold font-mono text-primary mt-0.5">
            {isTime ? (
              <span className="text-base font-normal text-foreground">
                {value > 0
                  ? new Date(value).toLocaleString('zh-CN')
                  : '暂无记录'}
              </span>
            ) : (
              <CountUp end={value} duration={0.6} separator="," />
            )}
            {suffix && !isTime && (
              <span className="text-sm font-normal text-muted-foreground ml-1">
                {suffix}
              </span>
            )}
          </p>
        </div>
      </div>
    </CardContent>
  </Card>
);

export function parseCsvFile(file: File): Promise<ParsedFile> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(
          sheet,
        );
        const columns =
          jsonData.length > 0 ? Object.keys(jsonData[0]) : [];
        const chunks: ChunkInfo[] = [];
        let currentChunk: Record<string, unknown>[] = [];
        let currentSize = 0;
        let chunkNo = 1;

        for (const row of jsonData) {
          const rowSize = new TextEncoder().encode(
            JSON.stringify(row),
          ).length;
          currentChunk.push(row);
          currentSize += rowSize;
          if (currentSize >= CHUNK_SIZE_THRESHOLD) {
            chunks.push({
              chunkNo,
              rowCount: currentChunk.length,
              size: currentSize,
              data: currentChunk,
              status: 'pending',
            });
            chunkNo++;
            currentChunk = [];
            currentSize = 0;
          }
        }
        if (currentChunk.length > 0) {
          chunks.push({
            chunkNo,
            rowCount: currentChunk.length,
            size: currentSize,
            data: currentChunk,
            status: 'pending',
          });
        }

        resolve({
          id: crypto.randomUUID(),
          name: file.name,
          totalSize: file.size,
          totalRows: jsonData.length,
          columns,
          chunks,
        });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}

export const ChunkStatusBadge: React.FC<{ status: ChunkStatus }> = ({
  status,
}) => {
  const config: Record<
    ChunkStatus,
    { color: string; icon: React.ReactNode; label: string }
  > = {
    pending: {
      color: 'text-muted-foreground bg-muted',
      icon: <Clock className="w-3 h-3" />,
      label: '待导入',
    },
    importing: {
      color: 'text-blue-600 bg-blue-50 animate-pulse',
      icon: <Loader2 className="w-3 h-3 animate-spin" />,
      label: '导入中',
    },
    completed: {
      color: 'text-emerald-600 bg-emerald-50',
      icon: <CheckCircle2 className="w-3 h-3" />,
      label: '已完成',
    },
    failed: {
      color: 'text-red-600 bg-red-50',
      icon: <AlertCircle className="w-3 h-3" />,
      label: '失败',
    },
  };
  const c = config[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${c.color}`}
    >
      {c.icon}
      {c.label}
    </span>
  );
};
