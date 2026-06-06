import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useDropzone } from 'react-dropzone';
import { toast } from 'sonner';
import {
  Upload,
  FileText,
  Loader2,
  Trash2,
  Search,
  Clock,
  Database,
  Layers,
  Play,
  ChevronDown,
  ChevronUp,
  X,
  Sparkles,
  Bot,
  MessageSquare,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from '@/components/ui/empty';
import { logger } from '@lark-apaas/client-toolkit/logger';
import * as importApi from '@client/src/api/import';
import type { ImportStatistics, ImportedDataRow } from '@shared/import';
import {
  type ParsedFile,
  type ChunkInfo,
  StatCard,
  ChunkStatusBadge,
  parseCsvFile,
  formatSize,
} from './components';
import AiAssistantDialog from './AiAssistantDialog';
import BitableImportDialog from './BitableImportDialog';

const ImportWorkbenchPage: React.FC = () => {
  const [stats, setStats] = useState<ImportStatistics>({
    totalFiles: 0, totalRows: 0, totalChunks: 0, lastImportedAt: null,
  });
  const [parsedFiles, setParsedFiles] = useState<ParsedFile[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
  const [expandedChunks, setExpandedChunks] = useState<Record<string, boolean>>({});
  const [tableData, setTableData] = useState<ImportedDataRow[]>([]);
  const [tableTotal, setTableTotal] = useState(0);
  const [tableColumns, setTableColumns] = useState<string[]>([]);
  const [tableFiles, setTableFiles] = useState<Array<{ id: string; name: string }>>([]);
  const [tablePage, setTablePage] = useState(1);
  const [tableFileId, setTableFileId] = useState('');
  const [tableKeyword, setTableKeyword] = useState('');
  const [tableLoading, setTableLoading] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{
    type: 'row' | 'file'; id: string; name: string;
  } | null>(null);
  const [aiAssistantOpen, setAiAssistantOpen] = useState(false);
  const [pendingFilesForAi, setPendingFilesForAi] = useState<File[]>([]);
  const [aiAssistantMode, setAiAssistantMode] = useState(false);
  const [bitableDialogOpen, setBitableDialogOpen] = useState(false);

  const refreshStats = useCallback(async () => {
    try { setStats(await importApi.getStatistics()); }
    catch (err) { logger.error('Failed to fetch statistics', err); }
  }, []);

  const refreshTable = useCallback(async () => {
    setTableLoading(true);
    try {
      const data = await importApi.listImportedData({
        page: tablePage, pageSize: 20,
        fileId: tableFileId || undefined, keyword: tableKeyword || undefined,
      });
      setTableData(data.items);
      setTableTotal(data.total);
      setTableColumns(data.columns);
      setTableFiles(data.files);
    } catch (err) { logger.error('Failed to fetch table data', err); }
    finally { setTableLoading(false); }
  }, [tablePage, tableFileId, tableKeyword]);

  useEffect(() => { refreshStats(); refreshTable(); }, []);
  useEffect(() => { refreshTable(); }, [tablePage, tableFileId, tableKeyword]);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const csvFiles = acceptedFiles.filter(f => f.name.endsWith('.csv'));
    if (csvFiles.length === 0) {
      toast.error('请选择 .csv 格式的文件');
      return;
    }
    for (const file of csvFiles) {
      if (file.size > 300 * 1024 * 1024) {
        toast.error(`${file.name} 超过 300MB 限制`);
        continue;
      }
    }
    
    if (aiAssistantMode) {
      setPendingFilesForAi(csvFiles);
      setAiAssistantOpen(true);
    } else {
      for (const file of csvFiles) {
        try {
          const parsed = await parseCsvFile(file);
          setParsedFiles((prev) => [...prev, parsed]);
          toast.success(`${file.name} 解析完成，共 ${parsed.totalRows} 行`);
        } catch (err) {
          logger.error(`Failed to parse ${file.name}`, err);
          toast.error(`${file.name} 解析失败`);
        }
      }
    }
  }, [aiAssistantMode]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, accept: { 'text/csv': ['.csv'] }, maxSize: 300 * 1024 * 1024,
  });

  const removeParsedFile = useCallback((id: string) => {
    setParsedFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const totalChunks = useMemo(
    () => parsedFiles.reduce((sum, f) => sum + f.chunks.length, 0),
    [parsedFiles],
  );

  const updateChunkStatus = useCallback(
    (fileId: string, chunkNo: number, status: string, errorMsg?: string) => {
      setParsedFiles((prev) =>
        prev.map((f) =>
          f.id === fileId
            ? { ...f, chunks: f.chunks.map((c) =>
                c.chunkNo === chunkNo ? { ...c, status: status as ChunkInfo['status'], errorMsg } : c,
              )}
            : f,
        ),
      );
    }, [],
  );

  const handleImport = useCallback(async () => {
    if (parsedFiles.length === 0 || isImporting) return;
    setIsImporting(true);
    const allItems: Array<{ file: ParsedFile; chunk: ChunkInfo }> = [];
    for (const file of parsedFiles) {
      for (const chunk of file.chunks) allItems.push({ file, chunk });
    }
    setImportProgress({ current: 0, total: allItems.length });
    const fileIdMap: Record<string, string> = {};

    for (let i = 0; i < allItems.length; i++) {
      const { file, chunk } = allItems[i];
      updateChunkStatus(file.id, chunk.chunkNo, 'importing');
      try {
        const result = await importApi.submitChunk({
          fileId: fileIdMap[file.id],
          fileInfo: {
            name: file.name, totalSize: file.totalSize,
            totalRows: file.totalRows, columns: file.columns,
            totalChunks: file.chunks.length,
          },
          chunk: {
            chunkNo: chunk.chunkNo, rowCount: chunk.rowCount,
            size: chunk.size, data: chunk.data,
          },
        });
        if (result.status === 'success' && result.fileId) {
          fileIdMap[file.id] = result.fileId;
        }
        updateChunkStatus(
          file.id, chunk.chunkNo,
          result.status === 'success' ? 'completed' : 'failed',
          result.errorMsg,
        );
      } catch (err) {
        logger.error(`Chunk ${chunk.chunkNo} import failed`, err);
        updateChunkStatus(file.id, chunk.chunkNo, 'failed', 'Network error');
      }
      setImportProgress({ current: i + 1, total: allItems.length });
    }
    setIsImporting(false);
    refreshStats();
    refreshTable();
    toast.success('导入任务完成');
  }, [parsedFiles, isImporting, refreshStats, refreshTable, updateChunkStatus]);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      if (deleteTarget.type === 'row') {
        await importApi.deleteDataById(deleteTarget.id);
        toast.success('已删除该条数据');
      } else {
        await importApi.deleteByFileId(deleteTarget.id);
        toast.success(`已删除文件 "${deleteTarget.name}" 的所有数据`);
      }
      refreshStats(); refreshTable();
    } catch (err) { logger.error('Delete failed', err); toast.error('删除失败'); }
    setDeleteDialogOpen(false);
    setDeleteTarget(null);
  }, [deleteTarget, refreshStats, refreshTable]);

  const toggleChunkPreview = useCallback((key: string) => {
    setExpandedChunks((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const totalPages = Math.ceil(tableTotal / 20);

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
      {/* Statistics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="已导入文件数" value={stats.totalFiles} icon={<FileText className="w-5 h-5" />} suffix="个" />
        <StatCard label="总数据条数" value={stats.totalRows} icon={<Database className="w-5 h-5" />} suffix="条" />
        <StatCard label="分块总数" value={stats.totalChunks} icon={<Layers className="w-5 h-5" />} suffix="块" />
        <StatCard label="最近导入时间" value={stats.lastImportedAt ? new Date(stats.lastImportedAt).getTime() : 0} icon={<Clock className="w-5 h-5" />} isTime />
      </div>

      {/* Upload Area */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold">数据导入</CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5"
                onClick={() => setBitableDialogOpen(true)}
              >
                <Database className="w-3.5 h-3.5" />
                多维表格导入
              </Button>
              <Button
                variant={aiAssistantMode ? 'default' : 'outline'}
                size="sm"
                className="h-8 text-xs gap-1.5"
                onClick={() => setAiAssistantMode(!aiAssistantMode)}
              >
                {aiAssistantMode ? <Bot className="w-3.5 h-3.5" /> : <MessageSquare className="w-3.5 h-3.5" />}
                {aiAssistantMode ? '智能助手：已开启' : '智能导入助手'}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div
            {...getRootProps()}
            className={`border-dashed border-2 rounded-lg p-8 text-center cursor-pointer transition-colors ${
              isDragActive ? 'border-primary bg-accent' : 'border-primary/30 hover:border-primary hover:bg-accent/50'
            }`}
          >
            <input {...getInputProps()} />
            <Upload className="w-8 h-8 mx-auto text-primary/60 mb-3" />
            <p className="text-sm text-foreground">
              {isDragActive ? '释放文件以解析' : '拖拽 CSV 文件到此处，或点击选择文件'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">仅支持 .csv 格式，单文件最大 300MB</p>
          </div>
        </CardContent>
      </Card>

      {/* Parsed Files + Import */}
      {parsedFiles.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-foreground">
              已解析文件 ({parsedFiles.length})
            </h3>
            <Button onClick={handleImport} disabled={isImporting} className="bg-primary text-primary-foreground">
              {isImporting ? (
                <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />导入中...</>
              ) : (
                <><Play className="w-4 h-4 mr-1.5" />开始导入 ({totalChunks} 个分块)</>
              )}
            </Button>
          </div>

          {isImporting && importProgress.total > 0 && (
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-muted-foreground">导入进度</span>
                  <span className="text-sm font-mono font-medium text-primary">
                    {importProgress.current}/{importProgress.total}
                  </span>
                </div>
                <Progress value={(importProgress.current / importProgress.total) * 100} className="h-2" />
              </CardContent>
            </Card>
          )}

          {parsedFiles.map((file) => (
            <Card key={file.id}>
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-primary" />
                    <span className="font-medium text-sm truncate">{file.name}</span>
                    <Badge variant="secondary" className="text-xs">{file.totalRows.toLocaleString()} 行</Badge>
                    <Badge variant="outline" className="text-xs">{formatSize(file.totalSize)}</Badge>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => removeParsedFile(file.id)} disabled={isImporting} className="h-7 w-7 p-0">
                    <X className="w-4 h-4" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {file.columns.slice(0, 8).map((col: string) => (
                    <span key={col} className="inline-flex items-center rounded px-1.5 py-0.5 text-xs bg-accent text-accent-foreground">{col}</span>
                  ))}
                  {file.columns.length > 8 && (
                    <span className="text-xs text-muted-foreground">+{file.columns.length - 8} 列</span>
                  )}
                </div>
                <div className="space-y-2">
                  {file.chunks.map((chunk: ChunkInfo) => {
                    const previewKey = `${file.id}-${chunk.chunkNo}`;
                    const isExpanded = expandedChunks[previewKey];
                    return (
                      <div key={chunk.chunkNo} className="border border-border rounded-md overflow-hidden">
                        <div className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-accent/30" onClick={() => toggleChunkPreview(previewKey)}>
                          <div className="flex items-center gap-2">
                            <div className="w-0.5 h-5 rounded-full bg-primary/40" />
                            <span className="text-xs font-medium">分块 #{chunk.chunkNo}</span>
                            <span className="text-xs text-muted-foreground">{chunk.rowCount} 行 · {formatSize(chunk.size)}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <ChunkStatusBadge status={chunk.status} />
                            {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
                          </div>
                        </div>
                        {isExpanded && chunk.data.length > 0 && (
                          <div className="border-t border-border overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="bg-accent/50">
                                  {Object.keys(chunk.data[0]).map((key: string) => (
                                    <th key={key} className="px-2 py-1.5 text-left font-medium text-muted-foreground whitespace-nowrap">{key}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {chunk.data.slice(0, 5).map((row: Record<string, unknown>, idx: number) => (
                                  <tr key={idx} className="border-t border-border/50">
                                    {Object.keys(chunk.data[0]).map((key: string) => (
                                      <td key={key} className="px-2 py-1.5 text-foreground whitespace-nowrap max-w-[200px] truncate">
                                        {String(row[key] ?? '')}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Data Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base font-semibold">已导入数据</CardTitle>
            <div className="flex items-center gap-2">
              <Select value={tableFileId || 'all'} onValueChange={(val: string) => { setTableFileId(val === 'all' ? '' : val); setTablePage(1); }}>
                <SelectTrigger size="sm"><SelectValue placeholder="全部文件" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部文件</SelectItem>
                  {tableFiles.map((f: { id: string; name: string }) => (
                    <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  placeholder="搜索关键字..."
                  value={tableKeyword}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTableKeyword(e.target.value)}
                  onKeyDown={(e: React.KeyboardEvent) => { if (e.key === 'Enter') { setTablePage(1); refreshTable(); } }}
                  className="h-8 w-48 pl-8 text-sm"
                />
              </div>
              {tableFileId && (
                <Button variant="outline" size="sm" className="h-8 text-xs text-destructive" onClick={() => {
                  const file = tableFiles.find((f: { id: string; name: string }) => f.id === tableFileId);
                  setDeleteTarget({ type: 'file', id: tableFileId, name: file?.name ?? '' });
                  setDeleteDialogOpen(true);
                }}>
                  <Trash2 className="w-3.5 h-3.5 mr-1" />按文件删除
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {tableLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
            </div>
          ) : tableData.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon"><Upload className="w-6 h-6" /></EmptyMedia>
                <EmptyTitle>暂无导入数据</EmptyTitle>
                <EmptyDescription>上传 CSV 文件并开始导入，数据将在此展示</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <>
              <div className="border border-border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-accent/30">
                      <TableHead className="w-12 h-10 text-xs">#</TableHead>
                      <TableHead className="w-32 h-10 text-xs">来源文件</TableHead>
                      <TableHead className="w-20 h-10 text-xs">分块</TableHead>
                      {tableColumns.slice(0, 6).map((col: string) => (
                        <TableHead key={col} className="h-10 text-xs">{col}</TableHead>
                      ))}
                      <TableHead className="w-36 h-10 text-xs">导入时间</TableHead>
                      <TableHead className="w-16 h-10 text-xs">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tableData.map((row: ImportedDataRow, idx: number) => (
                      <TableRow key={row.id} className="h-12">
                        <TableCell className="text-xs font-mono text-muted-foreground">{(tablePage - 1) * 20 + idx + 1}</TableCell>
                        <TableCell className="text-xs truncate max-w-[120px]">{row.fileName}</TableCell>
                        <TableCell className="text-xs font-mono">#{row.chunkNo}</TableCell>
                        {tableColumns.slice(0, 6).map((col: string) => (
                          <TableCell key={col} className="text-xs max-w-[160px] truncate">{String(row.data[col] ?? '')}</TableCell>
                        ))}
                        <TableCell className="text-xs text-muted-foreground">
                          {row.importedAt ? new Date(row.importedAt).toLocaleString('zh-CN') : '-'}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={() => {
                            setDeleteTarget({ type: 'row', id: row.id, name: '' });
                            setDeleteDialogOpen(true);
                          }}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <span className="text-xs text-muted-foreground">
                    共 {tableTotal.toLocaleString()} 条，第 {tablePage}/{totalPages} 页
                  </span>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="sm" className="h-7 text-xs" disabled={tablePage <= 1} onClick={() => setTablePage((p: number) => Math.max(1, p - 1))}>上一页</Button>
                    <Button variant="outline" size="sm" className="h-7 text-xs" disabled={tablePage >= totalPages} onClick={() => setTablePage((p: number) => Math.min(totalPages, p + 1))}>下一页</Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.type === 'file'
                ? `将删除文件 "${deleteTarget.name}" 的所有导入数据（包括所有分块和数据行），此操作不可撤销。`
                : '将删除该条数据，此操作不可撤销。'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AiAssistantDialog
        open={aiAssistantOpen}
        onOpenChange={setAiAssistantOpen}
        files={pendingFilesForAi}
        onImportComplete={(parsedFiles) => {
          setParsedFiles((prev) => [...prev, ...parsedFiles]);
          setPendingFilesForAi([]);
        }}
      />

      <BitableImportDialog
        open={bitableDialogOpen}
        onOpenChange={setBitableDialogOpen}
        onComplete={() => { refreshStats(); refreshTable(); }}
      />
    </div>
  );
};

export default ImportWorkbenchPage;
