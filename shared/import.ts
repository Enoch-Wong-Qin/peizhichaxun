export type ChunkStatus = "pending" | "importing" | "completed" | "failed";

export interface CsvFileItem {
  id: string;
  name: string;
  totalSize: number;
  totalRows: number;
  columns: string[];
  totalChunks: number;
  completedChunks: number;
  status: ChunkStatus;
  importedAt: string | null;
}

export interface CsvChunkItem {
  id: string;
  fileId: string;
  chunkNo: number;
  rowCount: number;
  size: number;
  status: ChunkStatus;
  errorMsg: string | null;
  importedAt: string | null;
}

export interface ImportStatistics {
  totalFiles: number;
  totalRows: number;
  totalChunks: number;
  lastImportedAt: string | null;
}

export interface SubmitChunkRequest {
  fileId?: string;
  fileInfo: {
    name: string;
    totalSize: number;
    totalRows: number;
    columns: string[];
    totalChunks: number;
  };
  chunk: {
    chunkNo: number;
    rowCount: number;
    size: number;
    data: Record<string, unknown>[];
  };
}

export interface SubmitChunkResponse {
  fileId: string;
  chunkId: string;
  status: "success" | "failed";
  errorMsg?: string;
}

export interface ImportedDataQueryParams {
  page?: number;
  pageSize?: number;
  fileId?: string;
  chunkNo?: number;
  keyword?: string;
}

export interface ImportedDataRow {
  id: string;
  fileId: string;
  chunkId: string;
  fileName: string;
  chunkNo: number;
  data: Record<string, unknown>;
  importedAt: string;
}

export interface ImportedDataListResponse {
  items: ImportedDataRow[];
  total: number;
  columns: string[];
  files: Array<{ id: string; name: string }>;
}

export interface DeleteResponse {
  success: boolean;
}

export interface AiAnalyzeRequest {
  columns: string[];
  sampleRows: Record<string, unknown>[];
  fileName: string;
  totalRows: number;
}

export interface BitableImportRequest {
  url?: string;
}

export interface BitableImportStartResponse {
  fileId: string;
  status: 'started';
  message: string;
}

export interface BitableImportStatus {
  fileId: string;
  status: 'importing' | 'completed' | 'failed';
  totalRows: number;
  importedRows: number;
  errorMsg?: string;
}

export interface SyncAllTablesResponse {
  fileId: string;
  status: 'started';
  message: string;
}

export interface SyncStatus {
  fileId: string;
  status: 'syncing' | 'completed' | 'failed';
  totalRows: number;
  importedRows: number;
  tableCount: number;
  errorMsg?: string;
}

export interface ColumnAnalysis {
  name: string;
  type: string;
  description: string;
}

export interface AiAnalyzeResponse {
  columns: ColumnAnalysis[];
  duplicateRisk: 'low' | 'medium' | 'high';
  importSuggestion: string;
  summary: string;
  duplicateColumns: string[];
}
