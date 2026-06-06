// ---- plugin:natural_language_to_sql_query_1 ----
// ============================================================
// 插件 natural_language_to_sql_query_1 (自然语言转SQL查询条件) 的类型定义
// 由 get_plugin_ai_json 自动生成
// ============================================================

export interface NaturalLanguageToSqlQueryOneInput {
  /** 用户输入的自然语言查询内容 */
  user_query: string;
  /** 数据库表的列名列表，用逗号分隔 */
  table_columns: string;
}

/**
 * capabilityClient.load('natural_language_to_sql_query_1').call<NaturalLanguageToSqlQueryOneOutput>('textToJson', input)
 * 直接返回此类型，无 .data 包装，直接解构使用：
 * const { sqlCondition, selectFields, aiUnderstanding } = result;
 */
export interface NaturalLanguageToSqlQueryOneOutput {
  /** SQL WHERE条件片段，例如 "data->>'车型' LIKE '%eπ007%' */
  sqlCondition: string;
  /** 需要查询的字段名列表，用逗号分隔，查询所有字段时返回"*" */
  selectFields: string;
  /** AI对查询意图的中文理解描述，用于前端展示 */
  aiUnderstanding: string;
}
// ---- end:natural_language_to_sql_query_1 ----

// ---- plugin:csv_file_structure_analysis_1 ----
// ============================================================
// 插件 csv_file_structure_analysis_1 (CSV文件结构分析与导入建议) 的类型定义
// 由 get_plugin_ai_json 自动生成
// ============================================================

export interface CsvFileStructureAnalysisOneInput {
  /** CSV文件解析后的文本内容，包含列名和前几行样本数据 */
  csv_content: string;
}

/**
 * capabilityClient.load('csv_file_structure_analysis_1').call<CsvFileStructureAnalysisOneOutput>('textToJson', input)
 * 直接返回此类型，无 .data 包装，直接解构使用：
 * const { columns, duplicateRisk, importSuggestion, ... } = result;
 */
export interface CsvFileStructureAnalysisOneOutput {
  /** JSON数组字符串，每个元素包含name（列名）、type（推断数据类型）、description（业务含义描述）三个属性 */
  columns: string;
  /** 重复风险评估，只能是low、medium、high三个值之一 */
  duplicateRisk: string;
  /** 中文导入建议描述，详细说明该文件最适合的导入方式和注意事项 */
  importSuggestion: string;
  /** 文件内容的一句话概要描述 */
  summary: string;
}
// ---- end:csv_file_structure_analysis_1 ----


// ---- plugin:query_result_summary_generate_1 ----
// ============================================================
// 插件 query_result_summary_generate_1 (查询结果自然语言总结生成) 的类型定义
// 由 get_plugin_ai_json 自动生成
// ============================================================

export interface QueryResultSummaryGenerateOneInput {
  /** 用户提出的自然语言查询问题 */
  user_question: string;
  /** 查询返回的数据结果内容 */
  query_result: string;
  /** 查询返回的数据总条数 */
  result_count: string;
}

/**
 * capabilityClient.load('query_result_summary_generate_1').call<QueryResultSummaryGenerateOneOutput>('textGenerate', input)
 * 直接返回此类型，无 .data 包装，直接解构使用：
 * const { content, response } = result;
 */
export interface QueryResultSummaryGenerateOneOutput {
  /** [object Object] */
  content: string;
  /** [object Object] */
  response?: string;
}
// ---- end:query_result_summary_generate_1 ----

// ---- plugin:query_intent_understanding_1 ----
// ============================================================
// 插件 query_intent_understanding_1 (查询意图理解) 的类型定义
// 由 get_plugin_ai_json 自动生成
// ============================================================

export interface QueryIntentUnderstandingOneInput {
  /** 用户输入的自然语言查询文本 */
  user_query: string;
  /** 数据库可用的列名列表，逗号分隔 */
  database_columns: string;
}

/**
 * capabilityClient.load('query_intent_understanding_1').call<QueryIntentUnderstandingOneOutput>('textToJson', input)
 * 直接返回此类型，无 .data 包装，直接解构使用：
 * const { simplifiedQuery, queryIntent, searchKeywords, ... } = result;
 */
export interface QueryIntentUnderstandingOneOutput {
  /** 简化重写后的查询描述，明确列出需要在哪些字段搜索哪些关键词，例如：在产品名称字段搜索"奕派"和"007" */
  simplifiedQuery: string;
  /** 查询意图的详细描述，说明用户想要查询什么内容 */
  queryIntent: string;
  /** 逗号分隔的搜索关键词列表，每个关键词是独立的搜索单元，如"奕派","007" */
  searchKeywords: string;
  /** 逗号分隔的建议搜索字段名列表，从提供的数据库列名中选择最相关的字段 */
  suggestedColumns: string;
}
// ---- end:query_intent_understanding_1 ----