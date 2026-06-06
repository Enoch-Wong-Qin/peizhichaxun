import { useState, useEffect, useCallback, useRef } from 'react';
import { Database, Clock, RefreshCw, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { importApi } from '@client/src/api';

interface DataStatsBarProps {
  onSyncComplete?: () => void;
}

const DataStatsBar = ({ onSyncComplete }: DataStatsBarProps) => {
  const [totalRows, setTotalRows] = useState<number>(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [syncFileId, setSyncFileId] = useState<string | null>(null);
  const [importedRows, setImportedRows] = useState<number>(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      const stats = await importApi.getStatistics();
      setTotalRows(stats.totalRows);
      setLastSyncedAt(stats.lastImportedAt);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  const pollSyncStatus = useCallback(
    (fileId: string) => {
      stopPolling();
      pollRef.current = setInterval(async () => {
        try {
          const status = await importApi.getSyncStatus(fileId);
          setImportedRows(status.importedRows);

          if (status.status === 'completed') {
            stopPolling();
            setSyncing(false);
            setSyncFileId(null);
            toast.success(`同步完成，共导入 ${status.importedRows} 条数据`);
            fetchStats();
            onSyncComplete?.();
          } else if (status.status === 'failed') {
            stopPolling();
            setSyncing(false);
            setSyncFileId(null);
            toast.error(status.errorMsg || '同步失败');
            fetchStats();
          }
        } catch {
          stopPolling();
          setSyncing(false);
          setSyncFileId(null);
        }
      }, 2000);
    },
    [stopPolling, fetchStats, onSyncComplete],
  );

  const handleSync = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    setImportedRows(0);
    try {
      const res = await importApi.syncAllTables();
      setSyncFileId(res.fileId);
      toast.info('正在同步多维表格数据...');
      pollSyncStatus(res.fileId);
    } catch {
      setSyncing(false);
      setSyncFileId(null);
      toast.error('同步请求失败');
    }
  }, [syncing, pollSyncStatus]);

  const formatTime = (iso: string | null): string => {
    if (!iso) return '尚未同步';
    const d = new Date(iso);
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${month}-${day} ${hours}:${minutes}`;
  };

  return (
    <div className="flex items-center gap-4 rounded-lg bg-card p-4 shadow-sm">
      <div className="flex items-center gap-3 flex-1">
        <div className="flex items-center gap-2 rounded-lg bg-accent px-3 py-2">
          <Database className="size-4 text-primary" />
          <span className="text-sm text-muted-foreground">总条数</span>
          <span className="font-mono text-lg font-bold text-foreground">
            {totalRows.toLocaleString()}
          </span>
        </div>

        <div className="flex items-center gap-2 rounded-lg bg-accent px-3 py-2">
          <Clock className="size-4 text-primary" />
          <span className="text-sm text-muted-foreground">最近同步</span>
          <span className="font-mono text-sm font-semibold text-foreground">
            {formatTime(lastSyncedAt)}
          </span>
        </div>
      </div>

      <Button
        variant="outline"
        disabled={syncing}
        onClick={handleSync}
        className="gap-2"
      >
        {syncing ? (
          <>
            <RefreshCw className="size-4 animate-spin" />
            <span>
              同步中 {importedRows > 0 && `(${importedRows.toLocaleString()})`}
            </span>
          </>
        ) : lastSyncedAt ? (
          <>
            <RefreshCw className="size-4" />
            重新同步
          </>
        ) : (
          <>
            <CheckCircle2 className="size-4" />
            同步数据
          </>
        )}
      </Button>

      {syncFileId && <span className="hidden">{syncFileId}</span>}
    </div>
  );
};

export default DataStatsBar;
