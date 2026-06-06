/* 前后端共享的类型写在这里 */

export * from "./import";
export * from "./ai";

export type ChunkStatusValue = "pending" | "importing" | "completed" | "failed";

export interface CsvFileEntity {
  id: string;
  name: string;
  totalSize: number;
  totalRows: number;
  columns: string[];
  totalChunks: number;
  completedChunks: number;
  status: ChunkStatusValue;
  importedAt: string | null;
  createdAt: string;
  createdBy: string | null;
  updatedAt: string;
  updatedBy: string | null;
}

export interface CsvChunkEntity {
  id: string;
  fileId: string;
  chunkNo: number;
  rowCount: number;
  size: number;
  status: ChunkStatusValue;
  errorMsg: string | null;
  importedAt: string | null;
  createdAt: string;
  createdBy: string | null;
  updatedAt: string;
  updatedBy: string | null;
}

export interface ImportedDataEntity {
  id: string;
  fileId: string;
  chunkId: string;
  data: Record<string, unknown>;
  createdAt: string;
  createdBy: string | null;
  updatedAt: string;
  updatedBy: string | null;
}
