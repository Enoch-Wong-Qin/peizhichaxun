import React, { useState, useRef, useEffect } from 'react';
import { Bot, User, Loader2, Send, FileText, CheckCircle, AlertCircle, Sparkles, Play, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { toast } from 'sonner';
import * as importApi from '@client/src/api/import';
import { parseCsvFile, type ParsedFile, type ChunkInfo } from './components';
import type { AiAnalyzeResponse } from '@shared/import';

interface Message {
  id: string;
  role: 'assistant' | 'user';
  content: string;
  type?: 'text' | 'file-info' | 'analysis' | 'action';
  data?: unknown;
}

interface AiAssistantDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  files: File[];
  onImportComplete: (parsedFiles: ParsedFile[]) => void;
}

const AiAssistantDialog: React.FC<AiAssistantDialogProps> = ({
  open, onOpenChange, files, onImportComplete,
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [parsedFiles, setParsedFiles] = useState<ParsedFile[]>([]);
  const [analysisResults, setAnalysisResults] = useState<AiAnalyzeResponse[]>([]);
  const [currentStep, setCurrentStep] = useState<'idle' | 'analyzing' | 'confirming' | 'importing' | 'completed'>('idle');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && files.length > 0) {
      startAnalysis();
    }
  }, [open, files]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const startAnalysis = async () => {
    setMessages([
      {
        id: 'welcome',
        role: 'assistant',
        content: '你好！我是智能导入助手。我将帮你分析上传的文件，并协助完成数据导入。',
        type: 'text',
      },
    ]);
    setIsProcessing(true);
    setCurrentStep('analyzing');

    const newParsedFiles: ParsedFile[] = [];
    const newAnalysisResults: AiAnalyzeResponse[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      
      setMessages((prev) => [
        ...prev,
        {
          id: `file-${i}`,
          role: 'assistant',
          content: `正在读取 "${file.name}"...`,
          type: 'file-info',
          data: { name: file.name, size: file.size },
        },
      ]);

      try {
        const parsed = await parseCsvFile(file);
        newParsedFiles.push(parsed);

        setMessages((prev) => [
          ...prev,
          {
            id: `parsed-${i}`,
            role: 'assistant',
            content: `✓ 解析完成：${parsed.totalRows} 行数据，${parsed.columns.length} 个字段`,
            type: 'file-info',
          },
        ]);

        const sampleRows = parsed.chunks.length > 0
          ? parsed.chunks[0].data.slice(0, 5)
          : [];

        setMessages((prev) => [
          ...prev,
          {
            id: `analyzing-${i}`,
            role: 'assistant',
            content: '🔍 正在分析数据结构...',
            type: 'text',
          },
        ]);

        let analysis;
        try {
          analysis = await importApi.analyzeCsv({
            columns: parsed.columns,
            sampleRows,
            fileName: parsed.name,
            totalRows: parsed.totalRows,
          });
        } catch (analyzeErr) {
          const errMsg = analyzeErr instanceof Error ? analyzeErr.message : '分析服务暂不可用';
          const isTimeout = errMsg.includes('timeout') || errMsg.includes('超时');
          setMessages((prev) => [
            ...prev,
            {
              id: `analysis-${i}`,
              role: 'assistant',
              content: isTimeout
                ? `⚠️ AI 分析超时（字段过多），已跳过智能分析。文件已解析完成，共 ${parsed.columns.length} 个字段、${parsed.totalRows} 行数据。\n\n你可以直接导入，无需等待 AI 分析。`
                : `⚠️ AI 分析暂不可用（${errMsg}），已跳过。文件已解析完成，共 ${parsed.columns.length} 个字段、${parsed.totalRows} 行数据。\n\n你可以直接导入。`,
              type: 'analysis',
            },
          ]);
          continue;
        }

        newAnalysisResults.push(analysis);

        const colCount = analysis.columns.length;
        const showCols = analysis.columns.slice(0, 15);
        const colList = showCols.map((c: { name: string; type: string; description: string }) => `• ${c.name}（${c.type}）- ${c.description}`).join('\n');
        const moreNote = colCount > 15 ? `\n...及其他 ${colCount - 15} 个字段` : '';

        setMessages((prev) => [
          ...prev,
          {
            id: `analysis-${i}`,
            role: 'assistant',
            content: `📊 分析结果：\n${analysis.summary}\n\n检测到的字段（共 ${colCount} 个）：\n${colList}${moreNote}\n\n${analysis.duplicateRisk !== 'low' ? `⚠️ 重复风险：${analysis.duplicateRisk === 'high' ? '高' : '中'} - 建议检查数据` : '✓ 重复风险：低'}`,
            type: 'analysis',
            data: analysis,
          },
        ]);
      } catch (err) {
        logger.error(`Failed to process ${file.name}`, err);
        const errMsg = err instanceof Error ? err.message : '未知错误';
        setMessages((prev) => [
          ...prev,
          {
            id: `error-${i}`,
            role: 'assistant',
            content: `❌ 解析 "${file.name}" 失败：${errMsg}\n\n请检查文件是否为有效的 CSV 格式。`,
            type: 'text',
          },
        ]);
      }
    }

    setParsedFiles(newParsedFiles);
    setAnalysisResults(newAnalysisResults);
    setIsProcessing(false);
    setCurrentStep('confirming');

    setMessages((prev) => [
      ...prev,
      {
        id: 'confirm',
        role: 'assistant',
        content: `分析完成！共 ${newParsedFiles.length} 个文件等待导入。\n\n请告诉我：\n1. 直接输入「开始导入」立即执行\n2. 或输入具体问题，我可以进一步帮你分析数据`,
        type: 'action',
      },
    ]);
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isProcessing) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputValue,
      type: 'text',
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');

    const lowerInput = inputValue.toLowerCase().trim();
    
    if (lowerInput.includes('导入') || lowerInput.includes('开始') || lowerInput.includes('确认')) {
      await executeImport();
    } else if (lowerInput.includes('取消') || lowerInput.includes('不要')) {
      setMessages((prev) => [
        ...prev,
        {
          id: 'cancel-' + Date.now(),
          role: 'assistant',
          content: '已取消导入操作。如需重新开始，请关闭对话框后重新上传文件。',
          type: 'text',
        },
      ]);
      setCurrentStep('idle');
    } else {
      setMessages((prev) => [
        ...prev,
        {
          id: 'clarify-' + Date.now(),
          role: 'assistant',
          content: `我理解了你的需求。${parsedFiles.length > 0 ? `目前准备好导入 ${parsedFiles.length} 个文件，共 ${parsedFiles.reduce((sum, f) => sum + f.totalRows, 0)} 行数据。` : ''}\n\n请回复：\n• 「开始导入」- 执行导入\n• 「取消」- 放弃本次操作`,
          type: 'text',
        },
      ]);
    }
  };

  const executeImport = async () => {
    if (parsedFiles.length === 0) {
      toast.error('没有可导入的文件');
      return;
    }

    setIsProcessing(true);
    setCurrentStep('importing');

    setMessages((prev) => [
      ...prev,
      {
        id: 'import-start',
        role: 'assistant',
        content: '🚀 开始导入数据...',
        type: 'text',
      },
    ]);

    const fileIdMap: Record<string, string> = {};
    let totalChunks = 0;
    let completedChunks = 0;

    for (const file of parsedFiles) {
      totalChunks += file.chunks.length;
    }

    for (const file of parsedFiles) {
      for (const chunk of file.chunks) {
        try {
          const result = await importApi.submitChunk({
            fileId: fileIdMap[file.id],
            fileInfo: {
              name: file.name,
              totalSize: file.totalSize,
              totalRows: file.totalRows,
              columns: file.columns,
              totalChunks: file.chunks.length,
            },
            chunk: {
              chunkNo: chunk.chunkNo,
              rowCount: chunk.rowCount,
              size: chunk.size,
              data: chunk.data,
            },
          });

          if (result.status === 'success' && result.fileId) {
            fileIdMap[file.id] = result.fileId;
          }

          completedChunks++;
          
          if (completedChunks % 5 === 0 || completedChunks === totalChunks) {
            setMessages((prev) => [
              ...prev,
              {
                id: `progress-${completedChunks}`,
                role: 'assistant',
                content: `导入进度：${completedChunks}/${totalChunks} 分块已完成 (${Math.round((completedChunks / totalChunks) * 100)}%)`,
                type: 'text',
              },
            ]);
          }
        } catch (err) {
          logger.error(`Chunk import failed`, err);
        }
      }
    }

    setIsProcessing(false);
    setCurrentStep('completed');

    setMessages((prev) => [
      ...prev,
      {
        id: 'complete',
        role: 'assistant',
        content: `✅ 导入完成！\n\n成功导入 ${parsedFiles.length} 个文件，共 ${parsedFiles.reduce((sum, f) => sum + f.totalRows, 0)} 行数据。\n\n你可以在下方数据表格中查看导入结果，或前往「AI 智能查询」页面进行数据分析。`,
        type: 'action',
      },
    ]);

    onImportComplete(parsedFiles);
    toast.success('导入任务完成');
  };

  const handleClose = () => {
    if (currentStep === 'importing') {
      toast.error('导入进行中，请等待完成');
      return;
    }
    onOpenChange(false);
    setMessages([]);
    setParsedFiles([]);
    setAnalysisResults([]);
    setCurrentStep('idle');
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl h-[80vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <Bot className="w-5 h-5 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-base">智能导入助手</DialogTitle>
              <p className="text-xs text-muted-foreground">
                {currentStep === 'idle' && '准备就绪'}
                {currentStep === 'analyzing' && '正在分析文件...'}
                {currentStep === 'confirming' && '等待确认导入方案'}
                {currentStep === 'importing' && '正在导入数据...'}
                {currentStep === 'completed' && '导入完成'}
              </p>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 px-6 py-4" ref={scrollRef}>
          <div className="space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex gap-3 ${message.role === 'user' ? 'flex-row-reverse' : ''}`}
              >
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    message.role === 'assistant'
                      ? 'bg-primary/10'
                      : 'bg-muted'
                  }`}
                >
                  {message.role === 'assistant' ? (
                    <Bot className="w-4 h-4 text-primary" />
                  ) : (
                    <User className="w-4 h-4 text-muted-foreground" />
                  )}
                </div>
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                    message.role === 'assistant'
                      ? 'bg-accent text-accent-foreground rounded-tl-none'
                      : 'bg-primary text-primary-foreground rounded-tr-none'
                  }`}
                >
                  {message.type === 'file-info' && message.data && (
                    <div className="flex items-center gap-2 mb-2 pb-2 border-b border-border/50">
                      <FileText className="w-4 h-4" />
                      <span className="font-medium">
                        {(message.data as { name: string }).name}
                      </span>
                    </div>
                  )}
                  {message.content}
                </div>
              </div>
            ))}
            {isProcessing && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Bot className="w-4 h-4 text-primary" />
                </div>
                <div className="bg-accent rounded-2xl rounded-tl-none px-4 py-3 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  <span className="text-sm text-muted-foreground">处理中...</span>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="px-6 py-4 border-t border-border">
          {currentStep === 'confirming' && (
            <div className="flex gap-2 mb-3">
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => setInputValue('开始导入')}
              >
                <Play className="w-3 h-3 mr-1" />开始导入
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => setInputValue('取消')}
              >
                <X className="w-3 h-3 mr-1" />取消
              </Button>
            </div>
          )}
          
          <div className="flex gap-2">
            <Input
              placeholder={
                currentStep === 'confirming'
                  ? '输入「开始导入」执行，或「取消」放弃'
                  : '输入消息...'
              }
              value={inputValue}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInputValue(e.target.value)}
              onKeyDown={(e: React.KeyboardEvent) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              disabled={isProcessing || currentStep === 'completed'}
              className="flex-1"
            />
            <Button
              onClick={handleSendMessage}
              disabled={!inputValue.trim() || isProcessing || currentStep === 'completed'}
              size="icon"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AiAssistantDialog;
