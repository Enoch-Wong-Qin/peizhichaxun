export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AiQueryRequest {
  prompt: string;
  page?: number;
  pageSize?: number;
  history?: ConversationMessage[];
}

export interface QueryPlan {
  queryIntent: string;
  searchKeywords: string[];
  suggestedColumns: string[];
  simplifiedQuery: string;
  /** 约束覆盖检查：每个 user-prompt 中的关键约束是否在生成的 SQL 中有对应条件 */
  coveredConstraints?: string[];
  /** 意图理解遗漏的约束（如有） */
  missedConstraints?: string[];
}

/** 列元数据：关键分类字段的可选值，用于提升意图理解准确度 */
export interface ColumnValueHint {
  column: string;
  sampleValues: string[];
  totalDistinct: number;
}

export interface AiQueryResponse {
  data: Record<string, unknown>[];
  total: number;
  aiUnderstanding: string;
  costTime: number;
  columns: string[];
  answer?: string;
  queryPlan?: QueryPlan;
  cached?: boolean;
}

export interface AiQueryCondition {
  sqlCondition: string;
  selectFields: string[];
  aiUnderstanding: string;
}
