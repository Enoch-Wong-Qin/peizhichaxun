import { useState, useCallback, useRef, useEffect } from 'react';
import {
  Search,
  Sparkles,
  Lightbulb,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Image } from '@/components/ui/image';
import { aiApi } from '@client/src/api';
import type { AiQueryResponse, ConversationMessage, QueryPlan } from '@shared/ai';
import ApiGuidePanel from './ApiGuidePanel';
import DataStatsBar from './DataStatsBar';
import ConversationBubble from './ConversationBubble';

const EXAMPLE_PROMPTS = [
  '查询比亚迪的所有车型',
  '找出纯电动的中型车',
  '查询价格低于 15 万的车型',
  '查询搭载宁德时代电池的车型',
];

const EMPTY_IMAGE_URL =
  'https://miaoda.feishu.cn/aily/api/v1/files/static/c19e1d3c25bb480d9afbd51cf84bdaad_ve_miaoda';

const PAGE_SIZE = 20;

interface ConversationRound {
  prompt: string;
  aiUnderstanding: string;
  data: Record<string, unknown>[];
  total: number;
  costTime: number;
  columns: string[];
  answer?: string;
  page: number;
  queryPlan?: QueryPlan;
  cached?: boolean;
}

const AiQueryPage = () => {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [conversation, setConversation] = useState<ConversationRound[]>([]);
  const [bubbleLoading, setBubbleLoading] = useState(false);
  const conversationEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (conversation.length > 0) {
      conversationEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [conversation.length]);

  const buildHistory = useCallback(
    (rounds: ConversationRound[]): ConversationMessage[] => {
      const messages: ConversationMessage[] = [];
      for (const round of rounds) {
        messages.push({ role: 'user', content: round.prompt });
        messages.push({
          role: 'assistant',
          content: round.aiUnderstanding + (round.answer ? `\n${round.answer}` : ''),
        });
      }
      return messages;
    },
    [],
  );

  const handleQuery = useCallback(
    async (queryPrompt?: string) => {
      const actualPrompt = queryPrompt ?? input;
      if (!actualPrompt.trim() || loading) return;

      setError('');
      setLoading(true);

      const userRound: ConversationRound = {
        prompt: actualPrompt,
        aiUnderstanding: '',
        data: [],
        total: 0,
        costTime: 0,
        columns: [],
        page: 1,
      };
      setConversation((prev) => [...prev, userRound]);

      try {
        const history = buildHistory(conversation);
        const data: AiQueryResponse = await aiApi.queryByPrompt({
          prompt: actualPrompt,
          page: 1,
          pageSize: PAGE_SIZE,
          history,
        });

        const assistantRound: ConversationRound = {
          prompt: actualPrompt,
          aiUnderstanding: data.aiUnderstanding,
          data: data.data,
          total: data.total,
          costTime: data.costTime,
          columns: data.columns,
          answer: data.answer,
          page: 1,
          queryPlan: data.queryPlan,
          cached: data.cached,
        };

        setConversation((prev) => [...prev.slice(0, -1), assistantRound]);
        setInput('');
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : '查询失败，请稍后重试';
        setError(message);
        setConversation((prev) => prev.slice(0, -1));
      } finally {
        setLoading(false);
      }
    },
    [input, loading, conversation, buildHistory],
  );

  const handlePageChange = useCallback(
    async (msgIndex: number, newPage: number) => {
      const msg = conversation[msgIndex];
      if (!msg) return;

      setBubbleLoading(true);
      try {
        const history = buildHistory(conversation.slice(0, msgIndex));
        const data: AiQueryResponse = await aiApi.queryByPrompt({
          prompt: msg.prompt,
          page: newPage,
          pageSize: PAGE_SIZE,
          history,
        });

        setConversation((prev) =>
          prev.map((m: ConversationRound, i: number) =>
            i === msgIndex ? { ...m, data: data.data, page: newPage } : m,
          ),
        );
      } finally {
        setBubbleLoading(false);
      }
    },
    [conversation, buildHistory],
  );

  const handleClear = useCallback(() => {
    setConversation([]);
    setError('');
  }, []);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <DataStatsBar />

      <div className="rounded-lg border border-border bg-card shadow-sm">
        <div className="flex items-center justify-between border-b border-border px-6 py-3">
          <div className="flex items-center gap-2">
            <Sparkles className="size-5 text-primary" />
            <h2 className="text-base font-semibold text-foreground">
              AI 智能对话查询
            </h2>
            {conversation.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {conversation.length} 轮对话
              </span>
            )}
          </div>
          {conversation.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClear}
              className="text-muted-foreground hover:text-foreground"
            >
              <Trash2 className="mr-1 size-3.5" />
              清空对话
            </Button>
          )}
        </div>

        <div className="max-h-[60vh] overflow-y-auto px-6 py-4">
          {conversation.length === 0 ? (
            <div className="py-8 text-center">
              <Image
                src={EMPTY_IMAGE_URL}
                alt="AI 查询"
                width={100}
                height={100}
                className="mx-auto mb-3 opacity-50"
              />
              <p className="text-sm text-muted-foreground">
                用自然语言描述你想查询的车型数据，支持多轮追问
              </p>
              <p className="mt-1 text-xs text-muted-foreground/70">
                例如先查询比亚迪的车型，再追问“只看纯电动的”
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {conversation.map(
                (msg: ConversationRound, index: number) => (
                  <ConversationBubble
                    key={index}
                    prompt={msg.prompt}
                    aiUnderstanding={msg.aiUnderstanding}
                    data={msg.data}
                    total={msg.total}
                    costTime={msg.costTime}
                    columns={msg.columns}
                    answer={msg.answer}
                    page={msg.page}
                    totalPages={Math.max(1, Math.ceil(msg.total / PAGE_SIZE))}
                    loading={bubbleLoading}
                    defaultExpanded={index === conversation.length - 1}
                    queryPlan={msg.queryPlan}
                    cached={msg.cached}
                    onPageChange={(p: number) => handlePageChange(index, p)}
                  />
                ),
              )}
              <div ref={conversationEndRef} />
            </div>
          )}
        </div>
      </div>

      <QueryInput
        input={input}
        setInput={setInput}
        loading={loading}
        onQuery={() => handleQuery()}
        showExamples={conversation.length === 0}
      />

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <ApiGuidePanel />
    </div>
  );
};

interface QueryInputProps {
  input: string;
  setInput: (v: string) => void;
  loading: boolean;
  onQuery: () => void;
  showExamples: boolean;
}

const QueryInput = ({
  input,
  setInput,
  loading,
  onQuery,
  showExamples,
}: QueryInputProps) => {
  return (
    <div className="space-y-3">
      <div className="flex gap-3 rounded-lg bg-card p-4 shadow-sm">
        <Textarea
          className="min-h-[60px] flex-1 resize-none"
          placeholder="输入你的查询，支持追问上一轮结果..."
          value={input}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
            setInput(e.target.value)
          }
          onKeyDown={(e: React.KeyboardEvent) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              onQuery();
            }
          }}
        />
        <Button
          className="h-auto self-end bg-primary text-primary-foreground hover:bg-primary/90"
          disabled={loading || !input.trim()}
          onClick={onQuery}
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <span className="size-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
              查询中
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <Search className="size-4" />
              查询
            </span>
          )}
        </Button>
      </div>

      {showExamples && (
        <div className="flex flex-wrap gap-2">
          <Lightbulb className="size-4 text-muted-foreground" />
          {EXAMPLE_PROMPTS.map((example: string) => (
            <button
              key={example}
              type="button"
              className="rounded-full border border-border bg-accent px-3 py-1.5 text-xs text-accent-foreground transition-colors hover:bg-accent/80"
              onClick={() => setInput(example)}
            >
              {example}
            </button>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        按 Ctrl+Enter 快速查询 · 支持多轮追问上下文
      </p>
    </div>
  );
};

export default AiQueryPage;
