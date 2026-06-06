import { useState, useCallback } from 'react';
import { ChevronDown, ChevronRight, Copy, Check } from 'lucide-react';
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from '@/components/ui/collapsible';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { toast } from 'sonner';

const CODE_EXAMPLES = {
  curl: `curl -X POST https://your-domain.com/openapi/ai/query \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: your-api-key" \\
  -d '{"prompt": "找出所有油耗超过 8L 的车型数据", "page": 1, "pageSize": 20}'`,
  python: `import requests

response = requests.post(
    "https://your-domain.com/openapi/ai/query",
    headers={
        "Content-Type": "application/json",
        "X-API-Key": "your-api-key"
    },
    json={
        "prompt": "找出所有油耗超过 8L 的车型数据",
        "page": 1,
        "pageSize": 20
    }
)

data = response.json()
print(f"找到 {data['total']} 条结果")
print(f"AI 理解: {data['aiUnderstanding']}")
for row in data['data']:
    print(row)`,
  javascript: `const response = await fetch(
  "https://your-domain.com/openapi/ai/query",
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": "your-api-key"
    },
    body: JSON.stringify({
      prompt: "找出所有油耗超过 8L 的车型数据",
      page: 1,
      pageSize: 20
    })
  }
);

const data = await response.json();
console.log(\`找到 \${data.total} 条结果\`);
console.log(\`AI 理解: \${data.aiUnderstanding}\`);
data.data.forEach(row => console.log(row));`,
};

const RESPONSE_EXAMPLE = `{
  "data": [
    { "车型": "eπ007", "油耗": "8.5L/100km", "测试日期": "2025-12-01" },
    { "车型": "eπ008", "油耗": "9.2L/100km", "测试日期": "2025-12-02" }
  ],
  "total": 2,
  "aiUnderstanding": "查询油耗超过 8L 的车型测试数据",
  "costTime": 1250,
  "columns": ["车型", "油耗", "测试日期"]
}`;

type CodeLang = 'curl' | 'python' | 'javascript';

const CodeBlock = ({ lang, code }: { lang: CodeLang; code: string }) => {
  const [copied, setCopied] = useState<boolean>(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast.success('代码已复制到剪贴板');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('复制失败');
    }
  }, [code]);

  const label =
    lang === 'curl' ? 'cURL' : lang === 'python' ? 'Python' : 'JavaScript';

  return (
    <div className="relative">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          {label}
        </span>
        <button
          type="button"
          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-slate-400 transition-colors hover:text-slate-200"
          onClick={handleCopy}
        >
          {copied ? (
            <>
              <Check className="size-3" />
              已复制
            </>
          ) : (
            <>
              <Copy className="size-3" />
              复制
            </>
          )}
        </button>
      </div>
      <pre className="overflow-x-auto rounded-lg bg-slate-900 p-4 text-sm text-slate-100">
        <code className="font-mono">{code}</code>
      </pre>
    </div>
  );
};

const ApiGuidePanel = () => {
  const [isOpen, setIsOpen] = useState<boolean>(false);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-lg bg-card p-4 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-accent/50"
        >
          {isOpen ? (
            <ChevronDown className="size-4" />
          ) : (
            <ChevronRight className="size-4" />
          )}
          API 接入指南
          <span className="ml-auto rounded-full bg-accent px-2 py-0.5 text-xs text-muted-foreground">
            POST /openapi/ai/query
          </span>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-3 space-y-4">
        <div className="rounded-lg bg-card p-6 shadow-sm">
          <h3 className="mb-4 text-sm font-semibold text-foreground">
            请求参数
          </h3>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>参数名</TableHead>
                  <TableHead>类型</TableHead>
                  <TableHead>必填</TableHead>
                  <TableHead>说明</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-mono text-xs">prompt</TableCell>
                  <TableCell className="text-xs">string</TableCell>
                  <TableCell>
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                      是
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    自然语言查询描述
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-mono text-xs">page</TableCell>
                  <TableCell className="text-xs">number</TableCell>
                  <TableCell>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                      否
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    页码，默认 1
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-mono text-xs">pageSize</TableCell>
                  <TableCell className="text-xs">number</TableCell>
                  <TableCell>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                      否
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    每页条数，默认 20
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>

          <h3 className="mb-4 mt-6 text-sm font-semibold text-foreground">
            响应结构
          </h3>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>字段</TableHead>
                  <TableHead>类型</TableHead>
                  <TableHead>说明</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-mono text-xs">data</TableCell>
                  <TableCell className="text-xs">object[]</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    查询结果数据列表
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-mono text-xs">total</TableCell>
                  <TableCell className="text-xs">number</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    总结果条数
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-mono text-xs">
                    aiUnderstanding
                  </TableCell>
                  <TableCell className="text-xs">string</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    AI 对查询意图的理解描述
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-mono text-xs">costTime</TableCell>
                  <TableCell className="text-xs">number</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    查询耗时（毫秒）
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-mono text-xs">columns</TableCell>
                  <TableCell className="text-xs">string[]</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    数据列名列表
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>

          <h3 className="mb-4 mt-6 text-sm font-semibold text-foreground">
            调用示例
          </h3>
          <div className="space-y-4">
            <CodeBlock lang="curl" code={CODE_EXAMPLES.curl} />
            <CodeBlock lang="python" code={CODE_EXAMPLES.python} />
            <CodeBlock lang="javascript" code={CODE_EXAMPLES.javascript} />
          </div>

          <h3 className="mb-4 mt-6 text-sm font-semibold text-foreground">
            响应示例
          </h3>
          <pre className="overflow-x-auto rounded-lg bg-slate-900 p-4 text-sm text-slate-100">
            <code className="font-mono">{RESPONSE_EXAMPLE}</code>
          </pre>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

export default ApiGuidePanel;
