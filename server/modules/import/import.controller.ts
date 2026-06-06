import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { NeedLogin } from '@lark-apaas/fullstack-nestjs-core';
import { ImportService } from './import.service';
import type {
  ImportStatistics,
  SubmitChunkRequest,
  SubmitChunkResponse,
  ImportedDataListResponse,
  DeleteResponse,
  AiAnalyzeRequest,
  AiAnalyzeResponse,
  BitableImportRequest,
  BitableImportStartResponse,
  BitableImportStatus,
  SyncAllTablesResponse,
  SyncStatus,
} from '@shared/import';

@Controller('api/import')
export class ImportController {
  constructor(private readonly importService: ImportService) {}

  @Get('statistics')
  async getStatistics(): Promise<ImportStatistics> {
    return this.importService.getStatistics();
  }

  @NeedLogin()
  @Post('chunks')
  async submitChunk(
    @Body() body: SubmitChunkRequest,
  ): Promise<SubmitChunkResponse> {
    return this.importService.submitChunk(body);
  }

  @Get('data')
  async listImportedData(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('fileId') fileId?: string,
    @Query('chunkNo') chunkNo?: string,
    @Query('keyword') keyword?: string,
  ): Promise<ImportedDataListResponse> {
    return this.importService.listImportedData({
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
      fileId,
      chunkNo: chunkNo ? parseInt(chunkNo, 10) : undefined,
      keyword,
    });
  }

  @NeedLogin()
  @Delete('data/:id')
  async deleteDataById(
    @Param('id') id: string,
  ): Promise<DeleteResponse> {
    return this.importService.deleteDataById(id);
  }

  @NeedLogin()
  @Delete('files/:id')
  async deleteByFileId(
    @Param('id') id: string,
  ): Promise<DeleteResponse> {
    return this.importService.deleteByFileId(id);
  }

  @NeedLogin()
  @Post('analyze')
  async analyzeCsv(
    @Body() body: AiAnalyzeRequest,
  ): Promise<AiAnalyzeResponse> {
    return this.importService.analyzeCsvFile(body);
  }

  @NeedLogin()
  @Post('bitable')
  async importFromBitable(
    @Body() body: BitableImportRequest,
  ): Promise<BitableImportStartResponse> {
    return this.importService.startBitableImport(body.url);
  }

  @Get('bitable/status/:fileId')
  async getBitableImportStatus(
    @Param('fileId') fileId: string,
  ): Promise<BitableImportStatus> {
    return this.importService.getBitableImportStatus(fileId);
  }

  @NeedLogin()
  @Post('sync')
  async syncAllTables(): Promise<SyncAllTablesResponse> {
    return this.importService.syncAllTables();
  }

  @Get('sync/status/:fileId')
  async getSyncStatus(
    @Param('fileId') fileId: string,
  ): Promise<SyncStatus> {
    return this.importService.getSyncStatus(fileId);
  }
}
