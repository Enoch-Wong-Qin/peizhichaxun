import { Injectable, Inject, Logger, BadRequestException } from '@nestjs/common';
import {
  DRIZZLE_DATABASE,
  type PostgresJsDatabase,
  CapabilityService,
} from '@lark-apaas/fullstack-nestjs-core';
import { FeishuService } from '@server/modules/feishu/feishu.service';
import { eq, and, sql, count, max, desc } from 'drizzle-orm';
import {
  csvFile,
  csvChunk,
  importedData,
} from '@server/database/schema';
import type {
  ImportStatistics,
  SubmitChunkRequest,
  SubmitChunkResponse,
  ImportedDataQueryParams,
  ImportedDataListResponse,
  ImportedDataRow,
  DeleteResponse,
  BitableImportStartResponse,
  BitableImportStatus,
  SyncAllTablesResponse,
  SyncStatus,
} from '@shared/import';
import type { CsvFileStructureAnalysisOneInput } from '@shared/plugin-types';

function parseColumns(val: unknown): string[] {
  if (Array.isArray(val)) return val;
  if (typeof val !== 'string') return [];
  if (val === 'ARRAY[]' || val === '{}' || val === '') return [];
  try {
    const parsed = JSON.parse(val);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // not JSON
  }
  if (val.startsWith('{') && val.endsWith('}')) {
    const inner = val.slice(1, -1);
    if (!inner) return [];
    return inner.split(',').map((s: string) =>
      s.trim().replace(/^"|"$/g, ''),
    ).filter(Boolean);
  }
  return val.includes('|')
    ? val.split('|').map((s: string) => s.trim()).filter(Boolean)
    : val.split(',').map((s: string) => s.trim()).filter(Boolean);
}

function toNumber(val: unknown): number {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') return parseInt(val, 10) || 0;
  if (typeof val === 'bigint') return Number(val);
  return 0;
}

@Injectable()
export class ImportService {
  private readonly logger = new Logger(ImportService.name);

  private static readonly WIKI_NODE_TOKEN = 'HD4KwJnSvidquKklhJLc0Lx4nuA';
  private static readonly BITABLE_TABLE_ID = 'tblmaAHoYhPRGrEG';

  constructor(
    @Inject(DRIZZLE_DATABASE)
    private readonly db: PostgresJsDatabase,
    @Inject(CapabilityService)
    private readonly capabilityService: CapabilityService,
    private readonly feishuService: FeishuService,
  ) {}

  async getStatistics(): Promise<ImportStatistics> {
    const [fileCount] = await this.db
      .select({ value: count() })
      .from(csvFile);

    const [rowCount] = await this.db
      .select({ value: sql<string>`COALESCE(SUM(${csvFile.totalRows}), 0)` })
      .from(csvFile);

    const [chunkCount] = await this.db
      .select({ value: count() })
      .from(csvChunk);

    const [lastImport] = await this.db
      .select({ value: max(csvFile.importedAt) })
      .from(csvFile);

    return {
      totalFiles: toNumber(fileCount?.value),
      totalRows: toNumber(rowCount?.value),
      totalChunks: toNumber(chunkCount?.value),
      lastImportedAt: lastImport?.value
        ? new Date(lastImport.value).toISOString()
        : null,
    };
  }

  async submitChunk(req: SubmitChunkRequest): Promise<SubmitChunkResponse> {
    try {
      let fileId = req.fileId;

      if (!fileId) {
        const colsArr = `{${req.fileInfo.columns.map((c: string) => `"${c.replace(/"/g, '\\"')}"`).join(',')}}`;
        const [inserted] = await this.db
          .insert(csvFile)
          .values({
            name: req.fileInfo.name,
            totalSize: req.fileInfo.totalSize,
            totalRows: req.fileInfo.totalRows,
            columns: colsArr,
            totalChunks: req.fileInfo.totalChunks,
            completedChunks: 0,
            status: 'importing',
          })
          .returning({ id: csvFile.id });
        fileId = inserted.id;
      }

      const [chunkRow] = await this.db
        .insert(csvChunk)
        .values({
          fileId,
          chunkNo: req.chunk.chunkNo,
          rowCount: req.chunk.rowCount,
          size: req.chunk.size,
          status: 'completed',
          importedAt: new Date(),
        })
        .returning({ id: csvChunk.id });

      const chunkId = chunkRow.id;

      if (req.chunk.data.length > 0) {
        const rows = req.chunk.data.map(
          (row: Record<string, unknown>) => ({
            fileId,
            chunkId,
            data: row,
          }),
        );
        await this.db.insert(importedData).values(rows);
      }

      await this.db
        .update(csvFile)
        .set({
          completedChunks: sql`${csvFile.completedChunks} + 1`,
        })
        .where(eq(csvFile.id, fileId));

      const [updated] = await this.db
        .select({
          completedChunks: csvFile.completedChunks,
          totalChunks: csvFile.totalChunks,
        })
        .from(csvFile)
        .where(eq(csvFile.id, fileId));

      if (
        updated &&
        toNumber(updated.completedChunks) >= toNumber(updated.totalChunks)
      ) {
        await this.db
          .update(csvFile)
          .set({
            status: 'completed',
            importedAt: new Date(),
          })
          .where(eq(csvFile.id, fileId));
      }

      return { fileId, chunkId, status: 'success' };
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(
        `submitChunk failed: ${message}`,
        err instanceof Error ? err.stack : undefined,
      );
      return {
        fileId: req.fileId ?? '',
        chunkId: '',
        status: 'failed',
        errorMsg: message,
      };
    }
  }

  async listImportedData(
    params: ImportedDataQueryParams,
  ): Promise<ImportedDataListResponse> {
    const page = params.page && params.page > 0 ? params.page : 1;
    const pageSize =
      params.pageSize && params.pageSize > 0 ? params.pageSize : 20;
    const offset = (page - 1) * pageSize;

    const conditions = [];
    if (params.fileId) {
      conditions.push(eq(importedData.fileId, params.fileId));
    }
    if (params.chunkNo !== undefined && params.chunkNo > 0) {
      conditions.push(eq(csvChunk.chunkNo, params.chunkNo));
    }
    if (params.keyword) {
      conditions.push(
        sql`${importedData.data}::text ILIKE ${`%${params.keyword}%`}`,
      );
    }

    const whereClause =
      conditions.length > 0 ? and(...conditions) : undefined;

    const baseQuery = this.db
      .select({
        id: importedData.id,
        fileId: importedData.fileId,
        chunkId: importedData.chunkId,
        fileName: csvFile.name,
        chunkNo: csvChunk.chunkNo,
        data: importedData.data,
        importedAt: csvChunk.importedAt,
      })
      .from(importedData)
      .innerJoin(csvFile, eq(importedData.fileId, csvFile.id))
      .innerJoin(csvChunk, eq(importedData.chunkId, csvChunk.id));

    const itemsQuery = whereClause
      ? baseQuery.where(whereClause)
      : baseQuery;

    const items = await itemsQuery
      .orderBy(desc(importedData.createdAt))
      .limit(pageSize)
      .offset(offset);

    const [totalResult] = whereClause
      ? await this.db
          .select({ value: count() })
          .from(importedData)
          .innerJoin(csvFile, eq(importedData.fileId, csvFile.id))
          .innerJoin(csvChunk, eq(importedData.chunkId, csvChunk.id))
          .where(whereClause)
      : await this.db
          .select({ value: count() })
          .from(importedData);

    const allFiles = await this.db
      .select({ id: csvFile.id, name: csvFile.name })
      .from(csvFile)
      .orderBy(desc(csvFile.createdAt));

    const columnSet = new Set<string>();
    const allColumnsRows = await this.db
      .select({ columns: csvFile.columns })
      .from(csvFile);
    for (const row of allColumnsRows) {
      const cols = parseColumns(row.columns);
      for (const col of cols) {
        columnSet.add(col);
      }
    }

    if (columnSet.size === 0 && items.length > 0) {
      const firstData = items[0].data as Record<string, unknown>;
      if (firstData && typeof firstData === 'object') {
        for (const key of Object.keys(firstData)) {
          columnSet.add(key);
        }
      }
    }

    const rows: ImportedDataRow[] = items.map(
      (item: {
        id: string;
        fileId: string;
        chunkId: string;
        fileName: string;
        chunkNo: number;
        data: unknown;
        importedAt: Date | null;
      }) => ({
        id: item.id,
        fileId: item.fileId,
        chunkId: item.chunkId,
        fileName: item.fileName,
        chunkNo: item.chunkNo,
        data: item.data as Record<string, unknown>,
        importedAt: item.importedAt
          ? new Date(item.importedAt).toISOString()
          : '',
      }),
    );

    return {
      items: rows,
      total: toNumber(totalResult?.value),
      columns: Array.from(columnSet),
      files: allFiles,
    };
  }

  async deleteDataById(id: string): Promise<DeleteResponse> {
    await this.db.delete(importedData).where(eq(importedData.id, id));
    return { success: true };
  }

  async deleteByFileId(fileId: string): Promise<DeleteResponse> {
    await this.db
      .delete(importedData)
      .where(eq(importedData.fileId, fileId));
    await this.db
      .delete(csvChunk)
      .where(eq(csvChunk.fileId, fileId));
    await this.db.delete(csvFile).where(eq(csvFile.id, fileId));
    return { success: true };
  }

  private inferColumnType(name: string, sampleValues: unknown[]): { type: string; description: string } {
    const lower = name.toLowerCase().replace(/[_\s-]/g, '');
    const values = sampleValues.filter((v: unknown) => v != null && v !== '');

    if (values.length > 0) {
      const allNumeric = values.every((v: unknown) => !isNaN(Number(v)));
      if (allNumeric) {
        const nums = values.map((v: unknown) => Number(v));
        const allInt = nums.every((n: number) => Number.isInteger(n));
        return { type: allInt ? 'integer' : 'number', description: this.describeByHint(name) };
      }
      const datePattern = /^\d{4}[-/]\d{1,2}[-/]\d{1,2}/;
      const allDates = values.every((v: unknown) => datePattern.test(String(v)));
      if (allDates) return { type: 'date', description: this.describeByHint(name) };
    }

    return { type: 'string', description: this.describeByHint(name) };
  }

  private describeByHint(name: string): string {
    const lower = name.toLowerCase().replace(/[_\s-]/g, '');
    const hints: Record<string, string> = {
      id: '唯一标识', name: '名称', title: '标题', price: '价格',
      amount: '金额', count: '数量', date: '日期', time: '时间',
      email: '邮箱', phone: '电话', address: '地址', status: '状态',
      type: '类型', category: '分类', description: '描述', remark: '备注',
      model: '车型', engine: '发动机', motor: '电机', battery: '电池',
      fuel: '燃油', speed: '速度', power: '功率', torque: '扭矩',
      weight: '重量', length: '长度', width: '宽度', height: '高度',
      displacement: '排量', cylinder: '气缸', valve: '气门',
      drive: '驱动', transmission: '变速箱', gear: '挡位',
      warranty: '保修', capacity: '容量', range: '续航',
      charge: '充电', consumption: '能耗', acceleration: '加速',
    };
    for (const [key, desc] of Object.entries(hints)) {
      if (lower.includes(key)) return desc;
    }
    return name;
  }

  private parseBitableUrl(url: string): { nodeToken: string; tableId: string } {
    try {
      const parsed = new URL(url);
      
      const nodeToken = parsed.pathname.split('/').pop() || '';
      if (!nodeToken) {
        throw new BadRequestException('无法从链接中解析 node token');
      }
      
      const tableId = parsed.searchParams.get('table') || '';
      if (!tableId) {
        throw new BadRequestException('链接中缺少 table 参数');
      }
      
      return { nodeToken, tableId };
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      throw new BadRequestException(
        '无法解析多维表格链接，请确认链接格式正确',
      );
    }
  }

  async startBitableImport(
    url?: string,
  ): Promise<BitableImportStartResponse> {
    let nodeToken: string;
    let tableId: string;
    
    if (url) {
      const parsed = this.parseBitableUrl(url);
      nodeToken = parsed.nodeToken;
      tableId = parsed.tableId;
    } else {
      nodeToken = ImportService.WIKI_NODE_TOKEN;
      tableId = ImportService.BITABLE_TABLE_ID;
    }

    const now = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
    const fileName = `多维表格导入_${dateStr}`;

    const [inserted] = await this.db
      .insert(csvFile)
      .values({
        name: fileName,
        totalSize: 0,
        totalRows: 0,
        columns: 'ARRAY[]',
        totalChunks: 0,
        completedChunks: 0,
        status: 'importing',
      })
      .returning({ id: csvFile.id });

    const fileId = inserted.id;

    this.executeBitableImport(fileId, nodeToken, tableId).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(
        `Background bitable import failed for ${fileId}: ${message}`,
        err instanceof Error ? err.stack : undefined,
      );
    });

    return {
      fileId,
      status: 'started',
      message: '多维表格导入任务已启动，请通过状态接口查询进度',
    };
  }

  private async executeBitableImport(
    fileId: string,
    nodeToken: string,
    tableId: string,
  ): Promise<void> {
    const BITABLE_PAGE_SIZE = 500;
    let totalRows = 0;

    try {
      const { objToken: appToken } = await this.feishuService.resolveWikiToken(
        nodeToken,
      );
      const client = this.feishuService.getClient();

      this.logger.log(
        `Bitable import ${fileId}: resolved appToken=${appToken}, tableId=${tableId}`,
      );

      const firstRes = await client.bitable.appTableRecord.search({
        path: { app_token: appToken, table_id: tableId },
        params: { page_size: BITABLE_PAGE_SIZE },
        data: {},
      });

      if (firstRes.code !== 0) {
        throw new Error(`Bitable API error [${firstRes.code}]: ${firstRes.msg}`);
      }

      const firstItems = firstRes.data?.items ?? [];
      const firstTotal = firstRes.data?.total ?? 0;

      if (firstItems.length === 0) {
        await this.db
          .update(csvFile)
          .set({ status: 'failed' })
          .where(eq(csvFile.id, fileId));
        this.logger.error(`Bitable import ${fileId}: no records found`);
        return;
      }

      const firstRecords = firstItems.map((item: { record_id: string; fields: Record<string, unknown> }) => ({
        id: item.record_id,
        record: item.fields,
      }));
      const columns = this.extractColumnsFromRecords(firstRecords);
      const colsArr = `{${columns.map((c: string) => `"${c.replace(/"/g, '\\"')}"`).join(',')}}`;

      await this.db
        .update(csvFile)
        .set({ columns: colsArr, totalRows: firstTotal })
        .where(eq(csvFile.id, fileId));

      let pageToken: string | undefined = undefined;
      let hasMore = firstRes.data?.has_more ?? false;
      let chunkNo = 1;
      let currentItems = firstItems;

      while (true) {
        const flatRows = currentItems.map(
          (item: { record_id: string; fields: Record<string, unknown> }) => ({
            baseRecordId: item.record_id,
            data: this.flattenBitableRecord(item.fields),
          }),
        );

        const [chunkRow] = await this.db
          .insert(csvChunk)
          .values({
            fileId,
            chunkNo,
            rowCount: flatRows.length,
            size: JSON.stringify(flatRows).length,
            status: 'completed',
            importedAt: new Date(),
          })
          .returning({ id: csvChunk.id });

        if (flatRows.length > 0) {
          const rows = flatRows.map(
            (row: { baseRecordId: string; data: Record<string, unknown> }) => ({
              fileId,
              chunkId: chunkRow.id,
              data: row.data,
              baseRecordId: row.baseRecordId,
            }),
          );
          await this.db.insert(importedData).values(rows).onConflictDoNothing({
            target: importedData.baseRecordId,
          });
        }

        totalRows += flatRows.length;

        await this.db
          .update(csvFile)
          .set({
            completedChunks: sql`${csvFile.completedChunks} + 1`,
            totalChunks: chunkNo,
            totalRows,
          })
          .where(eq(csvFile.id, fileId));

        this.logger.log(
          `Bitable import ${fileId} chunk ${chunkNo}: ${flatRows.length} rows, hasMore=${hasMore}`,
        );

        if (!hasMore) break;

        const nextRes = await client.bitable.appTableRecord.search({
          path: { app_token: appToken, table_id: tableId },
          params: { page_size: BITABLE_PAGE_SIZE, page_token: pageToken },
          data: {},
        });

        if (nextRes.code !== 0) {
          throw new Error(`Bitable API error [${nextRes.code}]: ${nextRes.msg}`);
        }

        currentItems = nextRes.data?.items ?? [];
        hasMore = nextRes.data?.has_more ?? false;
        pageToken = nextRes.data?.page_token;
        chunkNo++;
      }

      const [actualCount] = await this.db
        .select({ value: count() })
        .from(importedData)
        .where(eq(importedData.fileId, fileId));

      const actualRows = toNumber(actualCount?.value);

      await this.db
        .update(csvFile)
        .set({
          status: 'completed',
          importedAt: new Date(),
          totalRows: actualRows,
          totalChunks: chunkNo,
          completedChunks: chunkNo,
        })
        .where(eq(csvFile.id, fileId));

      this.logger.log(
        `Bitable import ${fileId} completed: ${actualRows} rows (API: ${totalRows}) in ${chunkNo} chunks`,
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(
        `executeBitableImport ${fileId} failed: ${message}`,
        err instanceof Error ? err.stack : undefined,
      );
      await this.db
        .update(csvFile)
        .set({ status: 'failed' })
        .where(eq(csvFile.id, fileId));
    }
  }

  async getBitableImportStatus(fileId: string): Promise<BitableImportStatus> {
    const [file] = await this.db
      .select({
        status: csvFile.status,
        totalRows: csvFile.totalRows,
        completedChunks: csvFile.completedChunks,
      })
      .from(csvFile)
      .where(eq(csvFile.id, fileId));

    if (!file) {
      return {
        fileId,
        status: 'failed',
        totalRows: 0,
        importedRows: 0,
        errorMsg: '文件记录不存在',
      };
    }

    const [rowCount] = await this.db
      .select({ value: count() })
      .from(importedData)
      .where(eq(importedData.fileId, fileId));

    return {
      fileId,
      status: file.status as BitableImportStatus['status'],
      totalRows: toNumber(file.totalRows),
      importedRows: toNumber(rowCount?.value),
    };
  }

  private extractColumnsFromRecords(
    records: Array<{ record: Record<string, unknown> }>,
  ): string[] {
    const colSet = new Set<string>();
    for (const r of records.slice(0, 10)) {
      const flat = this.flattenBitableRecord(r.record);
      for (const key of Object.keys(flat)) {
        colSet.add(key);
      }
    }
    return Array.from(colSet);
  }

  private flattenBitableRecord(
    record: Record<string, unknown>,
  ): Record<string, unknown> {
    const flat: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(record)) {
      flat[key] = this.extractDisplayValue(val);
    }
    return flat;
  }

  private extractDisplayValue(val: unknown): unknown {
    if (val === null || val === undefined) {
      return '';
    }

    if (typeof val !== 'object') {
      return val;
    }

    if (Array.isArray(val)) {
      return val.map((item) => this.extractDisplayValue(item)).join(', ');
    }

    const obj = val as Record<string, unknown>;

    if ('text' in obj && obj.text != null) {
      return this.extractDisplayValue(obj.text);
    }

    if ('name' in obj && obj.name != null) {
      return this.extractDisplayValue(obj.name);
    }

    if ('label' in obj && obj.label != null) {
      return this.extractDisplayValue(obj.label);
    }

    if ('value' in obj && obj.value != null) {
      return this.extractDisplayValue(obj.value);
    }

    if ('en_us' in obj && obj.en_us != null) {
      return this.extractDisplayValue(obj.en_us);
    }

    if ('zh_cn' in obj && obj.zh_cn != null) {
      return this.extractDisplayValue(obj.zh_cn);
    }

    const stringValue = Object.values(obj)
      .map((v) => this.extractDisplayValue(v))
      .filter((v) => v !== '' && v != null)
      .join(', ');

    return stringValue || JSON.stringify(obj);
  }

  async syncAllTables(): Promise<SyncAllTablesResponse> {
    this.logger.log('Starting full sync of all bitable tables');

    await this.db.delete(importedData);
    await this.db.delete(csvChunk);
    await this.db.delete(csvFile);

    this.logger.log('Cleared all existing data from imported_data, csv_chunk, csv_file');

    const now = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
    const fileName = `车型配置同步_${dateStr}`;

    const [inserted] = await this.db
      .insert(csvFile)
      .values({
        name: fileName,
        totalSize: 0,
        totalRows: 0,
        columns: 'ARRAY[]',
        totalChunks: 0,
        completedChunks: 0,
        status: 'importing',
      })
      .returning({ id: csvFile.id });

    const fileId = inserted.id;

    this.executeSyncAllTables(fileId).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(
        `Background sync failed for ${fileId}: ${message}`,
        err instanceof Error ? err.stack : undefined,
      );
    });

    return {
      fileId,
      status: 'started',
      message: '全表同步任务已启动',
    };
  }

  private async executeSyncAllTables(fileId: string): Promise<void> {
    const BITABLE_PAGE_SIZE = 500;
    let totalRows = 0;
    let chunkNo = 1;

    try {
      const { objToken: appToken } = await this.feishuService.resolveWikiToken(
        ImportService.WIKI_NODE_TOKEN,
      );
      const client = this.feishuService.getClient();

      const tablesRes = await client.bitable.appTable.list({
        path: { app_token: appToken },
      });

      if (tablesRes.code !== 0) {
        throw new Error(`Bitable API error [${tablesRes.code}]: ${tablesRes.msg}`);
      }

      const tables = tablesRes.data?.items ?? [];
      this.logger.log(`Found ${tables.length} tables to sync`);

      const allColumns = new Set<string>();

      for (const table of tables) {
        const tableId = table.table_id ?? '';
        const tableName = table.name ?? '';
        if (!tableId) continue;

        this.logger.log(`Syncing table: ${tableName} (${tableId})`);

        let pageToken: string | undefined;
        let hasMore = true;

        while (hasMore) {
          const res = await client.bitable.appTableRecord.search({
            path: { app_token: appToken, table_id: tableId },
            params: {
              page_size: BITABLE_PAGE_SIZE,
              ...(pageToken ? { page_token: pageToken } : {}),
            },
            data: {},
          });

          if (res.code !== 0) {
            this.logger.error(
              `Failed to fetch table ${tableName}: code=${res.code}, msg=${res.msg}`,
            );
            throw new Error(`Bitable API error [${res.code}]: ${res.msg}`);
          }

          const items = res.data?.items ?? [];
          if (items.length === 0) break;

          const flatRows = items.map(
            (item: { record_id: string; fields: Record<string, unknown> }) => ({
              baseRecordId: item.record_id,
              data: this.flattenBitableRecord(item.fields),
            }),
          );

          for (const row of flatRows) {
            for (const key of Object.keys(row.data)) {
              allColumns.add(key);
            }
          }

          const [chunkRow] = await this.db
            .insert(csvChunk)
            .values({
              fileId,
              chunkNo,
              rowCount: flatRows.length,
              size: JSON.stringify(flatRows).length,
              status: 'completed',
              importedAt: new Date(),
            })
            .returning({ id: csvChunk.id });

          const rows = flatRows.map(
            (row: { baseRecordId: string; data: Record<string, unknown> }) => ({
              fileId,
              chunkId: chunkRow.id,
              data: row.data,
              baseRecordId: row.baseRecordId,
            }),
          );
          await this.db.insert(importedData).values(rows).onConflictDoNothing({
            target: importedData.baseRecordId,
          });

          totalRows += flatRows.length;
          chunkNo++;

          this.logger.log(
            `Table ${tableName}: imported ${flatRows.length} rows (chunk ${chunkNo - 1})`,
          );

          hasMore = res.data?.has_more ?? false;
          pageToken = res.data?.page_token;
        }
      }

      const columns = Array.from(allColumns);
      const colsArr = `{${columns.map((c: string) => `"${c.replace(/"/g, '\\"')}"`).join(',')}}`;

      const [actualCount] = await this.db
        .select({ value: count() })
        .from(importedData)
        .where(eq(importedData.fileId, fileId));

      const actualRows = toNumber(actualCount?.value);

      await this.db
        .update(csvFile)
        .set({
          status: 'completed',
          importedAt: new Date(),
          totalRows: actualRows,
          totalChunks: chunkNo - 1,
          completedChunks: chunkNo - 1,
          columns: colsArr,
        })
        .where(eq(csvFile.id, fileId));

      this.logger.log(
        `Full sync completed: ${actualRows} rows from ${tables.length} tables in ${chunkNo - 1} chunks`,
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(
        `executeSyncAllTables ${fileId} failed: ${message}`,
        err instanceof Error ? err.stack : undefined,
      );
      await this.db
        .update(csvFile)
        .set({ status: 'failed' })
        .where(eq(csvFile.id, fileId));
    }
  }

  async getSyncStatus(fileId: string): Promise<SyncStatus> {
    const [file] = await this.db
      .select({
        status: csvFile.status,
        totalRows: csvFile.totalRows,
        completedChunks: csvFile.completedChunks,
      })
      .from(csvFile)
      .where(eq(csvFile.id, fileId));

    if (!file) {
      return {
        fileId,
        status: 'failed',
        totalRows: 0,
        importedRows: 0,
        tableCount: 0,
        errorMsg: '同步任务不存在',
      };
    }

    const [rowCount] = await this.db
      .select({ value: count() })
      .from(importedData)
      .where(eq(importedData.fileId, fileId));

    const [chunkCount] = await this.db
      .select({ value: count() })
      .from(csvChunk)
      .where(eq(csvChunk.fileId, fileId));

    return {
      fileId,
      status: file.status as SyncStatus['status'],
      totalRows: toNumber(file.totalRows),
      importedRows: toNumber(rowCount?.value),
      tableCount: toNumber(chunkCount?.value),
    };
  }

  async analyzeCsvFile(params: {
    columns: string[];
    sampleRows: Record<string, unknown>[];
    fileName: string;
    totalRows: number;
  }) {
    if (!params.columns || params.columns.length === 0) {
      throw new BadRequestException('列信息为空，无法分析');
    }

    const existingRows = await this.db
      .select({ columns: csvFile.columns })
      .from(csvFile);
    const existingColumns = new Set<string>();
    for (const row of existingRows) {
      const cols = parseColumns(row.columns);
      for (const col of cols) {
        existingColumns.add(col);
      }
    }
    const duplicateColumns = params.columns.filter((col: string) =>
      existingColumns.has(col),
    );

    const AI_SAMPLE_SIZE = 15;
    const aiColumns = params.columns.slice(0, AI_SAMPLE_SIZE);
    const ruleColumns = params.columns.slice(AI_SAMPLE_SIZE);

    let aiResult: Record<string, unknown> | null = null;
    let aiParsedColumns: Array<{ name: string; type: string; description: string }> = [];

    try {
      const headerLine = aiColumns.join(',');
      const sampleLines = params.sampleRows
        .slice(0, 2)
        .map((row: Record<string, unknown>) =>
          aiColumns.map((col: string) => String(row[col] ?? '')).join(','),
        )
        .join('\n');
      const csvContent = `${headerLine}\n${sampleLines}`;

      const plugin = this.capabilityService.load(
        'csv_file_structure_analysis_1',
      );

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('AI 分析超时')), 30000),
      );

      const raw = await Promise.race([
        plugin.call('textToJson', {
          csv_content: csvContent,
        } satisfies CsvFileStructureAnalysisOneInput),
        timeoutPromise,
      ]);

      aiResult = (raw ?? {}) as Record<string, unknown>;

      if (typeof aiResult.columns === 'string') {
        try {
          aiParsedColumns = JSON.parse(aiResult.columns);
        } catch {
          aiParsedColumns = [];
        }
      }

      if (aiParsedColumns.length === 0) {
        aiParsedColumns = aiColumns.map((col: string) => {
          const sampleVals = params.sampleRows.slice(0, 2).map((row: Record<string, unknown>) => row[col]);
          return { name: col, ...this.inferColumnType(col, sampleVals) };
        });
      }

      this.logger.log(`AI analysis done: ${aiParsedColumns.length} columns`);
    } catch (aiErr) {
      const msg = aiErr instanceof Error ? aiErr.message : String(aiErr);
      this.logger.warn(`AI analysis failed, using rule inference for all columns: ${msg}`);
      aiParsedColumns = aiColumns.map((col: string) => {
        const sampleVals = params.sampleRows.slice(0, 2).map((row: Record<string, unknown>) => row[col]);
        return { name: col, ...this.inferColumnType(col, sampleVals) };
      });
    }

    const ruleParsedColumns = ruleColumns.map((col: string) => {
      const sampleVals = params.sampleRows.slice(0, 2).map((row: Record<string, unknown>) => row[col]);
      return { name: col, ...this.inferColumnType(col, sampleVals) };
    });

    const allColumns = [...aiParsedColumns, ...ruleParsedColumns];

    const risk = aiResult ? String(aiResult.duplicateRisk ?? 'low') : 'low';
    const duplicateRisk = (['low', 'medium', 'high'].includes(risk)
      ? risk
      : 'low') as 'low' | 'medium' | 'high';

    const modeNote = ruleColumns.length > 0
      ? `（AI 分析前 ${AI_SAMPLE_SIZE} 列 + 规则推断其余 ${ruleColumns.length} 列）`
      : '';

    return {
      columns: allColumns,
      duplicateRisk,
      importSuggestion:
        aiResult && typeof aiResult.importSuggestion === 'string'
          ? aiResult.importSuggestion + modeNote
          : `建议直接导入${modeNote}`,
      summary:
        aiResult && typeof aiResult.summary === 'string'
          ? aiResult.summary
          : `CSV 文件分析完成，共 ${params.columns.length} 个字段`,
      duplicateColumns,
    };
  }
}
