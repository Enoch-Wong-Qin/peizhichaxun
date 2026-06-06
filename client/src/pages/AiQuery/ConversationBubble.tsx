import { useState, useEffect, useCallback } from 'react';
import {
  Sparkles,
  Database,
  Clock,
  MessageSquare,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  ChevronUp,
  Lightbulb,
  Columns3,
  Search,
  Download,
  Zap,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import type { QueryPlan } from '@shared/ai';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { exportToExcel } from '@client/src/utils/export-excel';

interface ConversationBubbleProps {
  prompt: string;
  aiUnderstanding: string;
  data: Record<string, unknown>[];
  total: number;
  costTime: number;
  columns: string[];
  answer?: string;
  page: number;
  totalPages: number;
  defaultExpanded: boolean;
  loading: boolean;
  queryPlan?: QueryPlan;
  cached?: boolean;
  onPageChange: (page: number) => void;
}

const ConversationBubble = ({
  prompt,
  aiUnderstanding,
  data,
  total,
  costTime,
  columns,
  answer,
  page,
  totalPages,
  defaultExpanded,
  loading,
  queryPlan,
  cached,
  onPageChange,
}: ConversationBubbleProps) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [showAnswer, setShowAnswer] = useState(total === 0);
  const [showPlan, setShowPlan] = useState(false);

  useEffect(() => {
    setExpanded(defaultExpanded);
  }, [defaultExpanded]);

  const handleExport = useCallback(() => {
    const safeName = prompt.replace(/[^\w\u4e00-\u9fff]/g, '_').slice(0, 30);
    exportToExcel(data, columns, `AI查询_${safeName}_${new Date().toLocaleDateString('zh-CN')}`);
  }, [data, columns, prompt]);

  if (!aiUnderstanding) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl bg-primary px-4 py-2.5 text-sm text-primary-foreground">
          <span className="flex items-center gap-2">
            <span className="size-3 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
            {prompt}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl bg-primary px-4 py-2.5 text-sm text-primary-foreground">
          {prompt}
        </div>
      </div>

      <div className="max-w-[90%] space-y-2">
        <div className="flex items-center gap-2 text-sm text-foreground">
          <Sparkles className="size-4 shrink-0 text-primary" />
          <span>{aiUnderstanding}</span>
        </div>

        {queryPlan && queryPlan.searchKeywords.length > 0 && (
          <div className="rounded-lg bg-accent/30 p-2.5">
            <button
              type="button"
              className="flex w-full items-center gap-2 text-left text-xs"
              onClick={() => setShowPlan(!showPlan)}
            >
              <Lightbulb className="size-3.5 shrink-0 text-amber-500" />
              <span className="font-medium text-muted-foreground">查询规划</span>
              {showPlan ? (
                <ChevronUp className="size-3 text-muted-foreground" />
              ) : (
                <ChevronDown className="size-3 text-muted-foreground" />
              )}
            </button>
            {showPlan && (
              <div className="mt-2 space-y-2 text-xs text-muted-foreground">
                <div className="flex items-start gap-1.5">
                  <Lightbulb className="mt-0.5 size-3 shrink-0 text-amber-500" />
                  <span>{queryPlan.queryIntent}</span>
                </div>
                <div className="flex items-start gap-1.5">
                  <Search className="mt-0.5 size-3 shrink-0 text-primary" />
                  <div className="flex flex-wrap gap-1">
                    {queryPlan.searchKeywords.map((kw: string, i: number) => (
                      <span key={i} className="rounded-full bg-primary/10 px-2 py-0.5 font-mono text-primary">
                        {kw}
                      </span>
                    ))}
                  </div>
                </div>
                {queryPlan.suggestedColumns.length > 0 && (
                  <div className="flex items-start gap-1.5">
                    <Columns3 className="mt-0.5 size-3 shrink-0 text-primary" />
                    <div className="flex flex-wrap gap-1">
                      {queryPlan.suggestedColumns.map((col: string, i: number) => (
                        <span key={i} className="rounded bg-border/60 px-1.5 py-0.5 font-mono">
                          {col}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {queryPlan.coveredConstraints && queryPlan.coveredConstraints.length > 0 && (
                  <div className="flex items-start gap-1.5">
                    <CheckCircle2 className="mt-0.5 size-3 shrink-0 text-emerald-500" />
                    <div className="flex flex-wrap gap-1 text-emerald-700">
                      {queryPlan.coveredConstraints.map((c: string, i: number) => (
                        <span key={i} className="rounded-full bg-emerald-100 px-2 py-0.5 font-mono text-xs">
                          {c.replace(/:/, ': ')}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {queryPlan.missedConstraints && queryPlan.missedConstraints.length > 0 && (
                  <div className="flex items-start gap-1.5">
                    <AlertTriangle className="mt-0.5 size-3 shrink-0 text-amber-500" />
                    <span className="text-amber-700">
                      可能遗漏: {queryPlan.missedConstraints.map((c: string) => c.replace(/:/, ': ')).join('、')}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Database className="size-3" />
            <span className="font-mono font-semibold text-foreground">
              {total}
            </span>{' '}
            条结果
          </span>
          <span className="flex items-center gap-1">
            <Clock className="size-3" />
            <span className="font-mono font-semibold text-foreground">
              {costTime}
            </span>{' '}
            ms
          </span>
          {cached && (
            <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-0.5 text-emerald-600">
              <Zap className="size-3" />
              缓存
            </span>
          )}
        </div>

        {answer && (
          <div className={`rounded-lg p-3 ${total === 0 ? 'bg-amber-50 border border-amber-200' : 'bg-accent/50'}`}>
            <button
              type="button"
              className="flex w-full items-center gap-2 text-left text-sm"
              onClick={() => setShowAnswer(!showAnswer)}
            >
              <MessageSquare className={`size-3.5 shrink-0 ${total === 0 ? 'text-amber-600' : 'text-primary'}`} />
              <span className="font-medium text-foreground">
                {total === 0 ? 'AI 提示' : 'AI 回答'}
              </span>
              {showAnswer ? (
                <ChevronUp className="size-3.5 text-muted-foreground" />
              ) : (
                <ChevronDown className="size-3.5 text-muted-foreground" />
              )}
            </button>
            {showAnswer && (
              <p className="mt-2 text-sm leading-relaxed whitespace-pre-line text-foreground/90">
                {answer}
              </p>
            )}
          </div>
        )}

        {data.length > 0 && (
          <div className="rounded-lg border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <button
                type="button"
                className="flex items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
                onClick={() => setExpanded(!expanded)}
              >
                {expanded ? (
                  <ChevronDown className="size-3.5" />
                ) : (
                  <ChevronRight className="size-3.5" />
                )}
                <span>
                  查看数据表格 (第 {page}/{totalPages} 页)
                </span>
              </button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-primary"
                onClick={handleExport}
              >
                <Download className="size-3.5" />
                导出 Excel
              </Button>
            </div>

            {expanded && (
              <div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {columns.map((col: string) => (
                          <TableHead
                            key={col}
                            className="whitespace-nowrap font-mono text-xs font-semibold"
                          >
                            {col}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.map(
                        (row: Record<string, unknown>, idx: number) => (
                          <TableRow key={idx}>
                            {columns.map((col: string) => (
                              <TableCell
                                key={col}
                                className="max-w-[200px] truncate font-mono text-xs"
                              >
                                {row[col] != null ? String(row[col]) : '-'}
                              </TableCell>
                            ))}
                          </TableRow>
                        ),
                      )}
                    </TableBody>
                  </Table>
                </div>

                {totalPages > 1 && (
                  <div className="flex items-center justify-between border-t border-border px-3 py-2 text-xs text-muted-foreground">
                    <span>
                      第 {page} / {totalPages} 页
                    </span>
                    <div className="flex gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page <= 1 || loading}
                        onClick={() => onPageChange(page - 1)}
                      >
                        <ChevronLeft className="size-3.5" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page >= totalPages || loading}
                        onClick={() => onPageChange(page + 1)}
                      >
                        <ChevronRight className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {loading && expanded && (
              <div className="flex items-center justify-center py-4 text-xs text-muted-foreground">
                <span className="size-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <span className="ml-2">加载中...</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ConversationBubble;
