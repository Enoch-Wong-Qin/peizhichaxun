import React, { useEffect, useState } from 'react';
import { Sparkles, Loader2, Shield, Lightbulb, AlertTriangle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { logger } from '@lark-apaas/client-toolkit/logger';
import * as importApi from '@client/src/api/import';
import type { ParsedFile } from './components';
import type { AiAnalyzeResponse } from '@shared/import';

interface AiAnalysisDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  file: ParsedFile | null;
}

const riskConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  low: { label: '低风险', color: 'text-emerald-600 bg-emerald-50', icon: <Shield className="w-3.5 h-3.5" /> },
  medium: { label: '中风险', color: 'text-amber-600 bg-amber-50', icon: <AlertTriangle className="w-3.5 h-3.5" /> },
  high: { label: '高风险', color: 'text-red-600 bg-red-50', icon: <AlertTriangle className="w-3.5 h-3.5" /> },
};

const AiAnalysisDialog: React.FC<AiAnalysisDialogProps> = ({
  open, onOpenChange, file,
}) => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AiAnalyzeResponse | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !file) return;
    setLoading(true);
    setResult(null);
    setError('');

    const sampleRows = file.chunks.length > 0
      ? file.chunks[0].data.slice(0, 5)
      : [];

    importApi.analyzeCsv({
      columns: file.columns,
      sampleRows,
      fileName: file.name,
      totalRows: file.totalRows,
    })
      .then(setResult)
      .catch((err: unknown) => {
        logger.error('AI analysis failed', err);
        setError(err instanceof Error ? err.message : 'AI 分析失败，请稍后重试');
      })
      .finally(() => setLoading(false));
  }, [open, file]);

  const risk = riskConfig[result?.duplicateRisk ?? 'low'];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-base">AI 智能分析</DialogTitle>
              <DialogDescription className="text-xs mt-0.5">
                {file?.name}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {loading && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="relative">
              <div className="w-12 h-12 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
              <Sparkles className="w-5 h-5 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
            </div>
            <p className="text-sm text-muted-foreground">AI 正在分析文件结构与数据特征...</p>
          </div>
        )}

        {error && !loading && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-center">
            <AlertTriangle className="w-5 h-5 text-destructive mx-auto mb-2" />
            <p className="text-sm text-destructive">{error}</p>
            <Button
              variant="outline" size="sm" className="mt-3 text-xs"
              onClick={() => onOpenChange(false)}
            >关闭</Button>
          </div>
        )}

        {result && !loading && (
          <div className="space-y-4">
            <div className="rounded-lg bg-accent/60 p-4">
              <p className="text-sm text-foreground leading-relaxed">
                {result.summary}
              </p>
              <p className="text-xs text-muted-foreground mt-1.5">
                共 {file?.totalRows.toLocaleString()} 行数据，{file?.columns.length} 个字段
              </p>
            </div>

            <div>
              <h4 className="text-sm font-medium text-foreground mb-2">字段分析</h4>
              <div className="border border-border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-accent/40">
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">字段名</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground w-24">类型</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">含义</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.columns.map((col, idx) => (
                      <tr key={idx} className="border-t border-border/50">
                        <td className="px-3 py-2">
                          <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">
                            {col.name}
                          </code>
                        </td>
                        <td className="px-3 py-2">
                          <Badge variant="outline" className="text-xs font-mono">
                            {col.type}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {col.description}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-0.5">
                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${risk.color}`}>
                  {risk.icon}
                  重复风险：{risk.label}
                </span>
              </div>
              {result.duplicateColumns.length > 0 && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  已有字段重叠：
                  {result.duplicateColumns.map((col: string) => (
                    <code key={col} className="mx-0.5 px-1 py-0.5 bg-muted rounded text-xs font-mono">
                      {col}
                    </code>
                  ))}
                </p>
              )}
            </div>

            <div className="rounded-lg bg-primary/5 border border-primary/15 p-4">
              <div className="flex items-center gap-1.5 mb-2">
                <Lightbulb className="w-4 h-4 text-primary" />
                <h4 className="text-sm font-medium text-primary">导入建议</h4>
              </div>
              <p className="text-sm text-foreground leading-relaxed">
                {result.importSuggestion}
              </p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default AiAnalysisDialog;
