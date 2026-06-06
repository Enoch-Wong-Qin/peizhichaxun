import { Injectable, Inject, Logger, BadRequestException } from '@nestjs/common';
import { CapabilityService } from '@lark-apaas/fullstack-nestjs-core';
import {
  DRIZZLE_DATABASE,
  type PostgresJsDatabase,
} from '@lark-apaas/fullstack-nestjs-core';
import { sql, count, eq, type SQL } from 'drizzle-orm';
import { importedData, queryCache } from '@server/database/schema';
import type {
  NaturalLanguageToSqlQueryOneInput,
  NaturalLanguageToSqlQueryOneOutput,
  QueryResultSummaryGenerateOneInput,
  QueryIntentUnderstandingOneInput,
  QueryIntentUnderstandingOneOutput,
} from '@shared/plugin-types';
import type { AiQueryResponse, ColumnValueHint, ConversationMessage, QueryPlan } from '@shared/ai';

export const PLUGIN_ID_NL_QUERY = 'natural_language_to_sql_query_1';
export const PLUGIN_ID_SUMMARY = 'query_result_summary_generate_1';
export const PLUGIN_ID_INTENT = 'query_intent_understanding_1';

const DANGEROUS_KEYWORDS =
  /\b(DROP|INSERT|UPDATE|DELETE|ALTER|CREATE|TRUNCATE|EXEC|EXECUTE|GRANT|REVOKE|INTO|TABLE|DATABASE|SCHEMA)\b/i;
const SQL_COMMENT_PATTERN = /(--|\/\*|\*\/)/;
const SQL_SEMICOLON = /;/;

/** 需要提供可选值样本的关键分类字段 */
const CATEGORICAL_HINT_COLUMNS = [
  '能源类型', '级别', '驱动方式', '变速箱类型', '环保标准',
  '燃油标号', '气缸排列形式', '进气形式', '供油方式',
  '国别', '厂商', '品牌',
];

/** 约束词组模式：用户 prompt 中常见的复合约束表达 */
const CONSTRAINT_PATTERNS: Array<{ pattern: RegExp; column: string; valueMap: Record<string, string> }> = [
  // 能源类型: "纯电动" / "纯电" / "汽油" / "插电混动" / "增程式" 等
  {
    pattern: /(纯电(?:动)?|电动|汽油|燃油|柴油|插电(?:式)?混(?:合)?(?:动)?|增程(?:式)?|氢(?:能)?(?:源)?|混(?:合)?(?:动)?|轻混|油电)/i,
    column: '能源类型',
    valueMap: {
      '纯电': '纯电动', '电动': '纯电动', '纯电动': '纯电动',
      '汽油': '汽油', '燃油': '汽油',
      '柴油': '柴油',
      '插电混动': '插电式混合动力', '插电混': '插电式混合动力', '插混': '插电式混合动力',
      '增程': '增程式', '增程式': '增程式',
      '混动': '混合动力', '混合': '混合动力', '轻混': '轻混',
    },
  },
  // 级别: "SUV" / "中型" / "轿车" 等
  {
    pattern: /(?:紧凑(?:型)?|中型?|大型|小型|微型|全尺寸)\s*(?:SUV|轿车|MPV|跑车|皮卡|越野)|(?:SUV|轿车|MPV|跑车|皮卡|越野|微面)/i,
    column: '级别',
    valueMap: {},
  },
  // 价格约束: "15万以下" / "10-20万"
  {
    pattern: /(\d+)\s*万\s*(?:以[下上内]|左右|以下|以上|以内|左右)|(\d+)\s*[-~至到]\s*(\d+)\s*万/i,
    column: '厂商指导价(元)',
    valueMap: {},
  },
];

function validateSqlCondition(condition: string): void {
  if (!condition || !condition.trim()) return;
  const trimmed = condition.trim();

  if (SQL_SEMICOLON.test(trimmed)) {
    throw new BadRequestException('查询条件包含非法字符（分号）');
  }
  if (SQL_COMMENT_PATTERN.test(trimmed)) {
    throw new BadRequestException('查询条件包含非法注释');
  }
  if (DANGEROUS_KEYWORDS.test(trimmed)) {
    throw new BadRequestException('查询条件包含危险 SQL 关键字');
  }
  if (/\b(UNION|SELECT\s+FROM|\(\s*SELECT)\b/i.test(trimmed)) {
    throw new BadRequestException('查询条件包含禁止的子查询或联合查询');
  }
}

function normalizeQueryKey(prompt: string): string {
  return prompt
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[，。？！、；：]/g, (c: string) => {
      const map: Record<string, string> = {
        '，': ',', '。': '.', '？': '?',
        '！': '!', '、': ',', '；': ';', '：': ':',
      };
      return map[c] || c;
    });
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  /** 列元数据缓存：distinct values for categorical columns */
  private columnHintsCache: ColumnValueHint[] | null = null;
  private columnHintsCacheTime = 0;
  /** 元数据缓存 TTL（5 分钟） */
  private readonly METADATA_CACHE_TTL = 5 * 60 * 1000;

  constructor(
    @Inject(CapabilityService)
    private readonly capabilityService: CapabilityService,
    @Inject(DRIZZLE_DATABASE)
    private readonly db: PostgresJsDatabase,
  ) {}

  /**
   * 获取关键分类字段的 distinct 值样本，带内存缓存。
   * 这些值样本帮助 AI 准确地将用户自然语言映射到数据库实际值。
   */
  private async getColumnValueHints(columns: string[]): Promise<ColumnValueHint[]> {
    const now = Date.now();
    if (this.columnHintsCache && (now - this.columnHintsCacheTime) < this.METADATA_CACHE_TTL) {
      return this.columnHintsCache;
    }

    const targetColumns = CATEGORICAL_HINT_COLUMNS.filter((c) => columns.includes(c));
    if (targetColumns.length === 0) return [];

    const hints: ColumnValueHint[] = [];
    for (const col of targetColumns) {
      try {
        const colRef = sql.raw(`data->>'${col}'`);
        const rows = await this.db
          .select({ value: colRef })
          .from(importedData)
          .where(sql`${colRef} IS NOT NULL AND ${colRef} != ''`)
          .groupBy(colRef)
          .orderBy(sql`COUNT(*) DESC`)
          .limit(25);

        const values = rows
          .map((r: { value: unknown }) => String(r.value ?? ''))
          .filter(Boolean);

        if (values.length > 0) {
          hints.push({ column: col, sampleValues: values.slice(0, 15), totalDistinct: values.length });
        }
      } catch {
        // 部分字段可能不是字符串，跳过
      }
    }

    this.columnHintsCache = hints;
    this.columnHintsCacheTime = now;
    return hints;
  }

  /**
   * 从用户 prompt 中提取关键约束词，用于后续覆盖校验。
   * 返回找到的约束描述列表。
   */
  private extractConstraints(prompt: string): string[] {
    const constraints: string[] = [];
    const lower = prompt.toLowerCase();

    // 能源类型约束
    const energyTerms = ['纯电', '电动', '汽油', '燃油', '柴油', '插电', '混动', '增程', '轻混', '氢能'];
    for (const term of energyTerms) {
      if (lower.includes(term)) {
        constraints.push(`能源类型:${term}`);
        break; // 只记录一个能源约束
      }
    }

    // 级别约束
    const levelTerms = ['SUV', '轿车', 'MPV', '跑车', '皮卡', '越野', '微面',
      '紧凑型', '中型', '中大型', '大型', '小型', '微型', '全尺寸'];
    for (const term of levelTerms) {
      if (lower.includes(term)) {
        constraints.push(`级别:${term}`);
        break;
      }
    }

    // 价格约束
    const priceMatch = prompt.match(/(\d+)\s*万\s*(?:以[下上内]|左右|以下|以上|以内|左右)?/);
    if (priceMatch) {
      constraints.push(`价格:${priceMatch[0]}`);
    }

    // 厂商/品牌约束
    const brandTerms = ['比亚迪', '奔驰', '宝马', '奥迪', '大众', '丰田', '本田', '日产',
      '奕派', '东风', '吉利', '长城', '长安', '奇瑞', '蔚来', '小鹏', '理想', '特斯拉',
      '捷达', '福田', '红旗', '领克', '极氪', '问界', '深蓝', '阿维塔'];
    for (const brand of brandTerms) {
      if (prompt.includes(brand)) {
        constraints.push(`厂商:${brand}`);
        break;
      }
    }

    // 座位数约束
    const seatMatch = prompt.match(/(\d)\s*座/);
    if (seatMatch) {
      constraints.push(`座位数:${seatMatch[1]}`);
    }

    // 驱动约束
    const driveTerms = ['前驱', '后驱', '四驱', '两驱', '前置前驱', '前置后驱', '双电机', '单电机'];
    for (const term of driveTerms) {
      if (lower.includes(term)) {
        constraints.push(`驱动:${term}`);
        break;
      }
    }

    return constraints;
  }

  /**
   * 校验生成的 SQL 条件是否覆盖了用户 prompt 中的关键约束。
   * 返回缺失的约束列表；如果全部覆盖则返回空数组。
   */
  private validateConstraintCoverage(
    constraints: string[],
    sqlCondition: string,
    columnHints: ColumnValueHint[],
  ): string[] {
    if (constraints.length === 0) return [];

    // 空 SQL 意味着未生成任何过滤条件 → 所有约束均未覆盖
    if (!sqlCondition.trim()) {
      return [...constraints];
    }

    const sqlLower = sqlCondition.toLowerCase();
    const missed: string[] = [];

    for (const constraint of constraints) {
      const [col, value] = constraint.split(':');
      if (!value) continue;

      // 检查 SQL 中是否包含该列名
      const hasColumn = sqlLower.includes(col.toLowerCase().replace(/\s/g, ''));
      if (!hasColumn) {
        missed.push(constraint);
        continue;
      }

      // 对分类字段做值映射校验
      const hint = columnHints.find((h) => h.column === col);
      if (hint) {
        // 通过 valueMap 映射用户用词到数据库实际值
        let mappedValue = value;
        const patternEntry = CONSTRAINT_PATTERNS.find((p) => p.column === col);
        if (patternEntry?.valueMap) {
          const vLower = value.toLowerCase();
          for (const [key, mapped] of Object.entries(patternEntry.valueMap)) {
            if (vLower === key.toLowerCase() || vLower.includes(key.toLowerCase()) || key.toLowerCase().includes(vLower)) {
              mappedValue = mapped;
              break;
            }
          }
        }

        // 检查映射值是否在数据库样本值中
        const matched = hint.sampleValues.some((sv) => {
          const svLower = sv.toLowerCase();
          const mvLower = mappedValue.toLowerCase();
          const valLower = value.toLowerCase();
          return svLower.includes(mvLower) || mvLower.includes(svLower) ||
            svLower.includes(valLower) || valLower.includes(svLower);
        });

        // 也检查 SQL 中是否直接写了该值
        const valueInSql = sqlLower.includes(value.toLowerCase()) ||
          sqlLower.includes(mappedValue.toLowerCase());

        if (!matched && !valueInSql) {
          missed.push(constraint);
        }
      } else if (!hasColumn) {
        // 无列提示且 SQL 中找不到列名 → 遗漏
        missed.push(constraint);
      }
    }

    return missed;
  }
    queryKey: string,
  ): Promise<{ sqlCondition: string; aiUnderstanding: string; queryPlan: QueryPlan; answer: string } | null> {
    try {
      const cached = await this.db
        .select({
          sqlCondition: queryCache.sqlCondition,
          aiUnderstanding: queryCache.aiUnderstanding,
          queryPlan: queryCache.queryPlan,
          answer: queryCache.answer,
        })
        .from(queryCache)
        .where(eq(queryCache.queryKey, queryKey))
        .limit(1);

      if (cached.length === 0) return null;

      await this.db
        .update(queryCache)
        .set({
          hitCount: sql`${queryCache.hitCount} + 1`,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        })
        .where(eq(queryCache.queryKey, queryKey));

      const row = cached[0];
      const plan = (row.queryPlan ?? {}) as Partial<QueryPlan>;
      return {
        sqlCondition: row.sqlCondition,
        aiUnderstanding: row.aiUnderstanding,
        answer: row.answer || '',
        queryPlan: {
          queryIntent: plan.queryIntent || '',
          searchKeywords: plan.searchKeywords || [],
          suggestedColumns: plan.suggestedColumns || [],
          simplifiedQuery: plan.simplifiedQuery || '',
        },
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Cache read failed: ${msg}`);
      return null;
    }
  }

  private async updateCacheAnswer(
    queryKey: string,
    answer: string,
  ): Promise<void> {
    try {
      await this.db
        .update(queryCache)
        .set({ answer, updatedAt: sql`CURRENT_TIMESTAMP` })
        .where(eq(queryCache.queryKey, queryKey));
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Cache answer update failed: ${msg}`);
    }
  }

  private async saveToCache(
    queryKey: string,
    sqlCondition: string,
    aiUnderstanding: string,
    plan: QueryPlan,
  ): Promise<void> {
    try {
      await this.db
        .insert(queryCache)
        .values({
          queryKey,
          sqlCondition,
          aiUnderstanding,
          queryPlan: plan,
          answer: '',
        })
        .onConflictDoUpdate({
          target: queryCache.queryKey,
          set: {
            sqlCondition,
            aiUnderstanding,
            queryPlan: plan,
            hitCount: sql`${queryCache.hitCount} + 1`,
            updatedAt: sql`CURRENT_TIMESTAMP`,
          },
        });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Cache write failed: ${msg}`);
    }
  }

  private async understandIntent(
    prompt: string,
    tableColumns: string[],
    history?: ConversationMessage[],
  ): Promise<QueryPlan> {
    const enrichedQuery = this.enrichPromptWithHistory(prompt, history);
    const input: QueryIntentUnderstandingOneInput = {
      user_query: enrichedQuery,
      database_columns: tableColumns.join(','),
    };

    try {
      const plugin = this.capabilityService.load(PLUGIN_ID_INTENT);
      const raw = await plugin.call('textToJson', input);
      const result = (raw ?? {}) as Partial<QueryIntentUnderstandingOneOutput>;

      const queryIntent =
        typeof result.queryIntent === 'string' ? result.queryIntent : prompt;
      const searchKeywords =
        typeof result.searchKeywords === 'string'
          ? result.searchKeywords.split(/[,，]/).map((k: string) => k.trim()).filter(Boolean)
          : [];
      const suggestedColumns =
        typeof result.suggestedColumns === 'string'
          ? result.suggestedColumns.split(/[,，]/).map((c: string) => c.trim()).filter(Boolean)
          : [];
      const simplifiedQuery =
        typeof result.simplifiedQuery === 'string' ? result.simplifiedQuery : '';

      return { queryIntent, searchKeywords, suggestedColumns, simplifiedQuery };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Intent understanding failed: ${msg}`);
      return { queryIntent: prompt, searchKeywords: [], suggestedColumns: [], simplifiedQuery: '' };
    }
  }

  private async generateSql(
    prompt: string,
    tableColumns: string[],
    history?: ConversationMessage[],
    queryPlan?: QueryPlan,
  ): Promise<NaturalLanguageToSqlQueryOneOutput> {
    const enrichedQuery = await this.buildEnrichedQuery(prompt, tableColumns, queryPlan, history);
    const input: NaturalLanguageToSqlQueryOneInput = {
      user_query: enrichedQuery,
      table_columns: tableColumns.join(','),
    };

    try {
      const plugin = this.capabilityService.load(PLUGIN_ID_NL_QUERY);
      const raw = await plugin.call('textToJson', input);
      const result = (raw ?? {}) as Partial<NaturalLanguageToSqlQueryOneOutput>;

      const sqlCondition =
        typeof result.sqlCondition === 'string' ? result.sqlCondition : '';
      const selectFields =
        typeof result.selectFields === 'string' ? result.selectFields : '*';
      const aiUnderstanding =
        typeof result.aiUnderstanding === 'string' && result.aiUnderstanding.trim()
          ? result.aiUnderstanding
          : '未能解析查询意图';

      const normalizedCondition = this.normalizeSqlCondition(sqlCondition, tableColumns);

      return { sqlCondition: normalizedCondition, selectFields, aiUnderstanding };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`SQL generation failed: ${msg}`, error instanceof Error ? error.stack : undefined);
      throw new BadRequestException(`AI 无法生成查询条件：${msg}`);
    }
  }

  async queryByPrompt(
    prompt: string,
    page: number = 1,
    pageSize: number = 20,
    history?: ConversationMessage[],
  ): Promise<AiQueryResponse> {
    const startTime = Date.now();
    const isPagination = page > 1;
    const hasHistory = history && history.length > 0;

    const columns = await this.getTableColumns();
    if (columns.length === 0) {
      return {
        data: [],
        total: 0,
        aiUnderstanding: '数据库中暂无导入数据，请先上传并导入 CSV 文件',
        costTime: Date.now() - startTime,
        columns: [],
      };
    }

    const queryKey = normalizeQueryKey(prompt);

    // 缓存命中（非翻页、非多轮对话时使用）
    if (!hasHistory && !isPagination) {
      const cached = await this.getCachedQuery(queryKey);
      if (cached) {
        this.logger.log(`Cache hit: ${queryKey}`);
        const result = await this.executeQuery(
          prompt, cached.sqlCondition, cached.aiUnderstanding,
          cached.queryPlan, columns, page, pageSize, startTime, true,
          cached.answer,
        );
        return result;
      }
    }

    // ① 提取用户约束（本地规则，不依赖 AI）
    const userConstraints = this.extractConstraints(prompt);
    this.logger.log(`提取到约束: [${userConstraints.join(', ')}]`);

    // ② 意图理解
    const queryPlan = await this.understandIntent(prompt, columns, history);

    // ③ SQL 生成（带列值提示）
    const parsed = await this.generateSql(prompt, columns, history, queryPlan);
    const { sqlCondition, aiUnderstanding } = parsed;

    // ④ 约束覆盖校验
    const columnHints = await this.getColumnValueHints(columns);
    const missedConstraints = this.validateConstraintCoverage(userConstraints, sqlCondition, columnHints);

    if (missedConstraints.length > 0) {
      this.logger.warn(
        `约束未覆盖: [${missedConstraints.join(', ')}] | SQL: ${sqlCondition}`,
      );

      // ⑤ 自动修正重试：构建强调缺失约束的增强 prompt
      const correctionPrompt = this.buildCorrectionPrompt(prompt, missedConstraints, columnHints);
      this.logger.log(`修正重试 prompt: ${correctionPrompt.substring(0, 200)}`);

      try {
        const retryPlan = await this.understandIntent(correctionPrompt, columns, history);
        const retryParsed = await this.generateSql(correctionPrompt, columns, history, retryPlan);
        const retrySqlCondition = retryParsed.sqlCondition;
        const retryUnderstanding = retryParsed.aiUnderstanding;

        const retryMissed = this.validateConstraintCoverage(userConstraints, retrySqlCondition, columnHints);

        if (retryMissed.length < missedConstraints.length) {
          // 重试改善了覆盖 → 使用重试结果
          this.logger.log(`修正重试成功，覆盖改善: ${missedConstraints.length}→${retryMissed.length}`);
          queryPlan.missedConstraints = retryMissed;
          queryPlan.coveredConstraints = userConstraints.filter((c) => !retryMissed.includes(c));

          const finalPlan = {
            ...queryPlan,
            queryIntent: `${queryPlan.queryIntent}（已自动修正，补充了 ${missedConstraints.filter((c) => !retryMissed.includes(c)).join('、')} 条件）`,
          };

          const result = await this.executeQuery(
            prompt, retrySqlCondition, `${retryUnderstanding}（自动修正查询条件）`,
            finalPlan, columns, page, pageSize, startTime, false,
          );

          if (!hasHistory && retrySqlCondition.trim()) {
            this.saveToCache(queryKey, retrySqlCondition, `${retryUnderstanding}（自动修正）`, finalPlan);
            if (result.answer) this.updateCacheAnswer(queryKey, result.answer);
          }

          return result;
        }
      } catch (retryErr) {
        this.logger.warn(`修正重试失败: ${retryErr instanceof Error ? retryErr.message : String(retryErr)}`);
      }

      // 重试未改善 → 标记但不阻塞
      queryPlan.missedConstraints = missedConstraints;
      queryPlan.coveredConstraints = userConstraints.filter((c) => !missedConstraints.includes(c));
    } else {
      queryPlan.coveredConstraints = userConstraints;
      queryPlan.missedConstraints = [];
    }

    // ⑥ 执行查询
    if (!hasHistory && sqlCondition.trim()) {
      this.saveToCache(queryKey, sqlCondition, aiUnderstanding, queryPlan);
    }

    const result = await this.executeQuery(
      prompt, sqlCondition, aiUnderstanding,
      queryPlan, columns, page, pageSize, startTime, false,
    );

    if (!hasHistory && !isPagination && sqlCondition.trim() && result.answer) {
      this.updateCacheAnswer(queryKey, result.answer);
    }

    return result;
  }

  private async executeQuery(
    prompt: string,
    sqlCondition: string,
    aiUnderstanding: string,
    queryPlan: QueryPlan,
    columns: string[],
    page: number,
    pageSize: number,
    startTime: number,
    cached: boolean,
    cachedAnswer?: string,
  ): Promise<AiQueryResponse> {
    const isPagination = page > 1;
    const offset = (page - 1) * pageSize;

    if (!sqlCondition.trim()) {
      const [rows, totalResult] = await Promise.all([
        this.db.select({
          id: importedData.id, fileId: importedData.fileId,
          chunkId: importedData.chunkId, data: importedData.data,
          createdAt: importedData.createdAt,
        }).from(importedData).limit(pageSize).offset(offset),
        this.db.select({ count: count() }).from(importedData),
      ]);
      const total = Number(totalResult[0]?.count ?? 0);
      const dataRows = rows.map((r: { data: unknown }) => r.data as Record<string, unknown>);
      const answer = isPagination
        ? ''
        : (cachedAnswer || await this.generateAnswer(prompt, dataRows, total));
      return { data: dataRows, total, aiUnderstanding, costTime: Date.now() - startTime, columns, answer, queryPlan, cached };
    }

    validateSqlCondition(sqlCondition);
    const conditionSql = sql.raw(sqlCondition);

    const [rows, totalResult] = await Promise.all([
      this.db.select({
        id: importedData.id, fileId: importedData.fileId,
        chunkId: importedData.chunkId, data: importedData.data,
        createdAt: importedData.createdAt,
      }).from(importedData).where(conditionSql).limit(pageSize).offset(offset),
      this.db.select({ count: count() }).from(importedData).where(conditionSql),
    ]);

    let total = Number(totalResult[0]?.count ?? 0);
    let dataRows = rows.map((r: { data: unknown }) => r.data as Record<string, unknown>);

    if (total === 0 && !isPagination && queryPlan.searchKeywords.length > 0) {
      const fuzzyResult = await this.fuzzyRetryByKeywords(queryPlan.searchKeywords, pageSize, columns);
      if (fuzzyResult) {
        total = fuzzyResult.total;
        dataRows = fuzzyResult.dataRows;
      }
    }

    let answer = '';
    if (!isPagination) {
      if (total === 0) {
        answer = `未找到匹配数据。当前数据可用的查询字段包括：${columns.slice(0, 15).join('、')}等。请尝试使用这些字段进行查询。`;
      } else if (cachedAnswer) {
        answer = cachedAnswer;
      } else {
        answer = await this.generateAnswer(prompt, dataRows, total);
      }
    }

    return { data: dataRows, total, aiUnderstanding, costTime: Date.now() - startTime, columns, answer, queryPlan, cached };
  }

  private async fuzzyRetryByKeywords(
    keywords: string[],
    pageSize: number,
    columns: string[],
  ): Promise<{ total: number; dataRows: Record<string, unknown>[] } | null> {
    const textColumns = columns.filter((col: string) => !/[\(（].*[\)）]/.test(col));
    if (textColumns.length === 0) return null;

    const andGroups = [];
    for (const keyword of keywords) {
      const orParts = textColumns.map((col: string) =>
        sql.raw(`data->>'${col}' ILIKE '%${keyword}%'`),
      );
      andGroups.push(sql.join(orParts, sql` OR `));
    }

    const fuzzyWhere = sql.join(andGroups, sql` AND `);
    const [rows, totalResult] = await Promise.all([
      this.db.select({
        id: importedData.id, fileId: importedData.fileId,
        chunkId: importedData.chunkId, data: importedData.data,
        createdAt: importedData.createdAt,
      }).from(importedData).where(fuzzyWhere).limit(pageSize),
      this.db.select({ count: count() }).from(importedData).where(fuzzyWhere),
    ]);

    const total = Number(totalResult[0]?.count ?? 0);
    if (total === 0) return null;

    const dataRows = rows.map((r: { data: unknown }) => r.data as Record<string, unknown>);
    return { total, dataRows };
  }

  private async buildEnrichedQuery(
    prompt: string,
    tableColumns: string[],
    plan?: QueryPlan,
    history?: ConversationMessage[],
  ): Promise<string> {
    const parts: string[] = [];

    parts.push('这是一个汽车车型配置数据库，每条记录是一款车型的完整配置信息。');

    // 列值提示 — 这是关键增强，让 AI 知道每个字段有哪些实际值可选
    const columnHints = await this.getColumnValueHints(tableColumns);
    if (columnHints.length > 0) {
      parts.push('');
      parts.push('【重要：关键字段的实际可选值】');
      parts.push('以下字段在数据库中的实际值（按出现频次排序），请严格对照使用：');
      for (const hint of columnHints) {
        parts.push(`  • ${hint.column} = [${hint.sampleValues.join(', ')}]${hint.totalDistinct > 15 ? ` ... 等${hint.totalDistinct}种` : ''}`);
      }
      parts.push('');
      parts.push('⚠️ 规则：用户提到的约束词必须映射到上述实际值。如"纯电动"→能源类型="纯电动"；"SUV"通常是级别字段值的一部分，如"紧凑型SUV""中型SUV"');
    }

    parts.push(`可用字段共 ${tableColumns.length} 个，完整列表：${tableColumns.join(', ')}`);

    if (history && history.length > 0) {
      const recentHistory = history.slice(-6);
      const historyParts = recentHistory.map((msg: ConversationMessage) => {
        const label = msg.role === 'user' ? '问' : '答';
        return `${label}: ${msg.content}`;
      });
      parts.push('');
      parts.push('【对话历史 — 当前查询应结合以下上下文】');
      parts.push(...historyParts);
    }

    parts.push('');
    parts.push(`【当前用户问题】${prompt.trim()}`);

    if (plan && plan.searchKeywords.length > 0) {
      parts.push('');
      parts.push('【查询规划】');
      parts.push(`意图: ${plan.queryIntent}`);
      parts.push(`关键词: ${plan.searchKeywords.join(', ')}`);
      if (plan.suggestedColumns.length > 0) {
        parts.push(`建议搜索字段: ${plan.suggestedColumns.join(', ')}`);
      }
    }

    // 强化的 SQL 生成规则
    parts.push('');
    parts.push('【SQL 生成规则 — 必须严格遵守】');
    parts.push('1. 用户问题中的每个约束条件必须在 sqlCondition 中体现。例如"纯电动SUV"必须同时包含 能源类型条件 AND 级别条件');
    parts.push('2. 分类字段（能源类型、级别等）使用 data->>\'字段名\' = \'精确值\' 精确匹配');
    parts.push('3. 车型名称、厂商等文本字段使用 data->>\'字段名\' LIKE \'%关键词%\' 模糊搜索');
    parts.push('4. 多个条件之间用 AND 连接（缩小范围）或 OR 连接（扩大范围）');
    parts.push('5. 数值字段（价格、马力等）使用 (data->>\'字段名\')::numeric >= 值');
    parts.push('6. sqlCondition 只输出 PostgreSQL WHERE 子句的条件部分，不要包含 WHERE 关键字、SELECT、FROM');
    parts.push('7. 字段名含括号时必须完整保留，如 data->>\'座位数(个)\'');
    parts.push('8. 如果用户问题同时提到能源类型和车型类别，你的 sqlCondition 中必须同时出现 能源类型 和 级别 两个字段的条件！');

    return parts.join('\n');
  }

  private enrichPromptWithHistory(
    prompt: string,
    history?: ConversationMessage[],
  ): string {
    if (!history || history.length === 0) return prompt.trim();
    const recentHistory = history.slice(-6);
    const historyParts = recentHistory.map((msg: ConversationMessage) => {
      const label = msg.role === 'user' ? '问' : '答';
      return `${label}: ${msg.content}`;
    });
    return [...historyParts, `当前问题(请结合上文理解): ${prompt.trim()}`].join('\n');
  }

  /**
   * 当 AI 生成的 SQL 遗漏了某些约束时，构建一个强调这些缺失约束的修正 prompt。
   */
  private buildCorrectionPrompt(
    originalPrompt: string,
    missedConstraints: string[],
    columnHints: ColumnValueHint[],
  ): string {
    const parts: string[] = [];

    parts.push(`【修正查询 — 前次查询遗漏了关键条件，本次必须补全】`);
    parts.push('');
    parts.push(`原始问题: ${originalPrompt}`);
    parts.push('');

    parts.push('【你遗漏了以下约束条件，请重新生成正确的 sqlCondition】');

    for (const mc of missedConstraints) {
      const [col, value] = mc.split(':');
      const hint = columnHints.find((h) => h.column === col);

      if (hint && col === '能源类型') {
        // 尝试映射值
        const matched = hint.sampleValues.find((sv) =>
          sv.includes(value) || value.includes(sv),
        );
        parts.push(`  ❌ 遗漏: ${col} = "${value}" → 数据库中实际值为 "${matched || value}"，请添加 data->>'能源类型' = '${matched || value}'`);
      } else if (hint) {
        const matched = hint.sampleValues.find((sv) =>
          sv.includes(value) || value.includes(sv),
        );
        if (matched) {
          parts.push(`  ❌ 遗漏: ${col} 包含 "${value}" → 数据库中实际存在 "${matched}"，请添加 data->>'${col}' LIKE '%${matched}%'`);
        } else {
          parts.push(`  ❌ 遗漏: ${col} 约束 "${value}" → 请在 data->>'${col}' 中添加相应条件`);
        }
      } else {
        parts.push(`  ❌ 遗漏: ${col} 约束 "${value}" → 请添加对应字段条件`);
      }
    }

    parts.push('');
    parts.push('请重新生成完整的 sqlCondition，确保包含以上所有遗漏的约束条件。');

    return parts.join('\n');
  }

  private async generateAnswer(
    prompt: string,
    data: Record<string, unknown>[],
    total: number,
  ): Promise<string> {
    try {
      const sampleData = data.slice(0, 10);
      const queryResult = JSON.stringify(sampleData, null, 2);

      const input: QueryResultSummaryGenerateOneInput = {
        user_question: prompt.trim(),
        query_result: queryResult,
        result_count: String(total),
      };

      const plugin = this.capabilityService.load(PLUGIN_ID_SUMMARY);
      let answer = '';
      for await (const chunk of plugin.callStream('textGenerate', input)) {
        const c = chunk as { content?: string };
        if (c.content) answer += c.content;
      }
      return answer || '无法生成回答';
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`AI 回答生成失败: ${msg}`);
      return '';
    }
  }

  private normalizeSqlCondition(condition: string, columns: string[]): string {
    if (!condition || !condition.trim()) return condition;

    const placeholders: string[] = [];
    let processed = condition;

    processed = processed.replace(/data\s*->>?\s*'([^']*)'/g, (match: string) => {
      const idx = placeholders.length;
      placeholders.push(match);
      return `__JBP${idx}__`;
    });

    const sorted = [...columns].sort((a: string, b: string) => b.length - a.length);
    for (const col of sorted) {
      const escaped = col.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`(?<!')(${escaped})(?!')`, 'g');
      processed = processed.replace(regex, `data->>'${col}'`);
    }

    processed = processed.replace(/__JBP(\d+)__/g, (_: string, idx: string) =>
      placeholders[parseInt(idx, 10)],
    );

    processed = processed.replace(
      /(data\s*->>\s*'[^']*')\s*([!=<>]+)\s*(-?\d+\.?\d*)\b/g,
      (_: string, accessor: string, op: string, num: string) => `(${accessor})::numeric ${op} ${num}`,
    );

    return processed;
  }

  private async getTableColumns(): Promise<string[]> {
    const firstRow = await this.db.select({ data: importedData.data }).from(importedData).limit(1);
    if (firstRow.length === 0) return [];
    const dataObj = firstRow[0].data as Record<string, unknown>;
    return Object.keys(dataObj);
  }
}
