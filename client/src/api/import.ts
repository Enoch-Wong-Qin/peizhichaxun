import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import type {
  ImportStatistics,
  ImportedDataQueryParams,
  ImportedDataListResponse,
  SubmitChunkRequest,
  SubmitChunkResponse,
  DeleteResponse,
  AiAnalyzeRequest,
  AiAnalyzeResponse,
  BitableImportRequest,
  BitableImportStartResponse,
  BitableImportStatus,
  SyncAllTablesResponse,
  SyncStatus,
} from '@shared/import';

const BASE = '/api/import';

export async function getStatistics(): Promise<ImportStatistics> {
  const response = await axiosForBackend({
    url: `${BASE}/statistics`,
    method: 'GET',
  });
  return response.data;
}

export async function submitChunk(
  payload: SubmitChunkRequest,
): Promise<SubmitChunkResponse> {
  const response = await axiosForBackend({
    url: `${BASE}/chunks`,
    method: 'POST',
    data: payload,
  });
  return response.data;
}

export async function listImportedData(
  params: ImportedDataQueryParams = {},
): Promise<ImportedDataListResponse> {
  const response = await axiosForBackend({
    url: `${BASE}/data`,
    method: 'GET',
    params,
  });
  return response.data;
}

export async function deleteDataById(id: string): Promise<DeleteResponse> {
  const response = await axiosForBackend({
    url: `${BASE}/data/${id}`,
    method: 'DELETE',
  });
  return response.data;
}

export async function deleteByFileId(fileId: string): Promise<DeleteResponse> {
  const response = await axiosForBackend({
    url: `${BASE}/files/${fileId}`,
    method: 'DELETE',
  });
  return response.data;
}

export async function analyzeCsv(
  payload: AiAnalyzeRequest,
): Promise<AiAnalyzeResponse> {
  const response = await axiosForBackend({
    url: `${BASE}/analyze`,
    method: 'POST',
    data: payload,
    timeout: 120000,
  });
  return response.data;
}

export async function importFromBitable(
  payload: BitableImportRequest,
): Promise<BitableImportStartResponse> {
  const response = await axiosForBackend({
    url: `${BASE}/bitable`,
    method: 'POST',
    data: payload,
  });
  return response.data;
}

export async function getBitableImportStatus(
  fileId: string,
): Promise<BitableImportStatus> {
  const response = await axiosForBackend({
    url: `${BASE}/bitable/status/${fileId}`,
    method: 'GET',
  });
  return response.data;
}

export async function syncAllTables(): Promise<SyncAllTablesResponse> {
  const response = await axiosForBackend({
    url: `${BASE}/sync`,
    method: 'POST',
  });
  return response.data;
}

export async function getSyncStatus(
  fileId: string,
): Promise<SyncStatus> {
  const response = await axiosForBackend({
    url: `${BASE}/sync/status/${fileId}`,
    method: 'GET',
  });
  return response.data;
}
