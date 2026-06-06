import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Loader2, CheckCircle2, AlertCircle, Database, Link } from 'lucide-react';
import { toast } from 'sonner';
import { logger } from '@lark-apaas/client-toolkit/logger';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import * as importApi from '@client/src/api/import';
import type { BitableImportStatus } from '@shared/import';

interface BitableImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
}

type ImportPhase = 'confirm' | 'importing' | 'completed' | 'failed';

const DEFAULT_BITABLE_URL = 'https://dongfengyipai.feishu.cn/wiki/HD4KwJnSvidquKklhJLc0Lx4nuA?table=tblmaAHoYhPRGrEG&view=vew5gjkgfE';

const BitableImportDialog: React.FC<BitableImportDialogProps> = ({
  open,
  onOpenChange,
  onComplete,
}) => {
  const [phase, setPhase] = useState<ImportPhase>('confirm');
  const [status, setStatus] = useState<BitableImportStatus | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [url, setUrl] = useState(DEFAULT_BITABLE_URL);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  useEffect(() => {
    if (open) {
      setPhase('confirm');
      setStatus(null);
      setErrorMsg('');
      setUrl(DEFAULT_BITABLE_URL);
      stopPolling();
    }
  }, [open, stopPolling]);

  const handleStart = useCallback(async () => {
    setPhase('importing');

    try {
      const result = await importApi.importFromBitable({ url: url.trim() || undefined });

      pollingRef.current = setInterval(async () => {
        try {
          const s = await importApi.getBitableImportStatus(result.fileId);
          setStatus(s);

          if (s.status === 'completed') {
            stopPolling();
            setPhase('completed');
            toast.success(`导入完成，共 ${s.importedRows.toLocaleString()} 条数据`);
            onComplete();
          } else if (s.status === 'failed') {
            stopPolling();
            setPhase('failed');
            setErrorMsg(s.errorMsg || '导入失败，请查看日志');
          }
        } catch (err) {
          logger.error('Polling bitable status failed', err);
        }
      }, 3000);
    } catch (err) {
      logger.error('Start bitable import failed', err);
      setPhase('failed');
      setErrorMsg(err instanceof Error ? err.message : '启动导入失败');
    }
  }, [stopPolling, onComplete]);

  const handleClose = useCallback(() => {
    if (phase === 'importing') return;
    stopPolling();
    onOpenChange(false);
  }, [phase, stopPolling, onOpenChange]);

  const progressPercent =
    status && status.totalRows > 0
      ? Math.min(100, Math.round((status.importedRows / status.totalRows) * 100))
      : 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Database className="w-5 h-5 text-primary" />
            从多维表格导入
          </DialogTitle>
          <DialogDescription>
            从已配置的多维表格中读取数据并导入
          </DialogDescription>
        </DialogHeader>

        {phase === 'confirm' && (
          <div className="py-4 space-y-4">
            <div className="flex items-center gap-2 text-sm text-foreground">
              <Link className="w-4 h-4 text-primary" />
              <span>粘贴飞书多维表格链接进行导入</span>
            </div>
            <Input
              placeholder="https://dongfengyipai.feishu.cn/wiki/..."
              value={url}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUrl(e.target.value)}
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              支持格式：飞书知识库中多维表格的分享链接，需包含 table 参数
            </p>
            {!url.trim() && (
              <p className="text-xs text-red-500">请输入多维表格链接</p>
            )}
          </div>
        )}

        {phase === 'importing' && (
          <div className="space-y-4 py-4">
            <div className="flex items-center justify-center gap-3 text-primary">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm font-medium">正在导入数据...</span>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  已导入 {status?.importedRows.toLocaleString() ?? 0} / {status?.totalRows.toLocaleString() ?? '?'} 行
                </span>
                <span className="font-mono font-medium text-primary">{progressPercent}%</span>
              </div>
              <Progress value={progressPercent} className="h-2" />
            </div>
            <p className="text-xs text-muted-foreground text-center">
              导入在后台执行，关闭此窗口不会影响进度
            </p>
          </div>
        )}

        {phase === 'completed' && (
          <div className="space-y-4 py-6 text-center">
            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
            <div>
              <p className="text-sm font-medium text-foreground">导入完成</p>
              <p className="text-xs text-muted-foreground mt-1">
                共导入 {status?.importedRows.toLocaleString() ?? 0} 条数据
              </p>
            </div>
          </div>
        )}

        {phase === 'failed' && (
          <div className="space-y-4 py-6 text-center">
            <AlertCircle className="w-10 h-10 text-red-500 mx-auto" />
            <div>
              <p className="text-sm font-medium text-foreground">导入失败</p>
              <p className="text-xs text-muted-foreground mt-1">{errorMsg}</p>
            </div>
          </div>
        )}

        <DialogFooter>
          {phase === 'confirm' && (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                取消
              </Button>
              <Button 
                onClick={handleStart} 
                disabled={!url.trim()}
                className="bg-primary text-primary-foreground"
              >
                开始导入
              </Button>
            </>
          )}
          {phase === 'importing' && (
            <Button variant="outline" onClick={handleClose}>
              关闭（后台继续执行）
            </Button>
          )}
          {phase === 'completed' && (
            <Button onClick={() => onOpenChange(false)} className="bg-primary text-primary-foreground">
              完成
            </Button>
          )}
          {phase === 'failed' && (
            <>
              <Button variant="outline" onClick={() => setPhase('confirm')}>
                重试
              </Button>
              <Button onClick={() => onOpenChange(false)}>
                关闭
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default BitableImportDialog;
