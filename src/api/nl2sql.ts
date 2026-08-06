/**
 * AI 助手 API：NL2SQL 模块
 *
 * 对齐后端契约：
 *   POST /nl2sql/generate   生成 SQL（同步）
 *   GET  /nl2sql/link       Schema Linking 查询（调试）
 *   POST /nl2sql/execute    生成 + 执行 + 解读（T3.4 支持 datasourceId）
 *   POST /nl2sql/schema/sync    Schema 同步
 *   GET  /nl2sql/schema/tables  Schema 表列表
 *   GET  /nl2sql/audits         T3.7 审计日志列表
 *   POST /nl2sql/audits/{id}/feedback  T3.1 反馈驱动自学习
 *   CRUD /nl2sql/datasources    T3.4 多数据源管理
 */
import { aiRequestClient } from './client';
import { Nl2sqlApi, path } from './endpoints';

/** SQL 执行结果（T3.3 增加 chartType） */
export interface SqlResultVO {
  columns: string[];
  rows: Array<Record<string, any>>;
  rowCount: number;
  elapsedMs: number;
  interpretation?: string;
  /** T3.3 推荐图表类型：bar/line/pie/table */
  chartType?: string;
}

/** 生成 SQL 响应 */
export interface Nl2sqlGenerateVO {
  sql: string;
  linkedTables: string[];
}

/** T3.7 审计日志 */
export interface Nl2sqlAuditVO {
  id: string;
  question: string;
  sqlText: string;
  dbName: string;
  linkedTables?: string;
  complexity: string;
  retryCount: number;
  executeSuccess?: boolean;
  rowCount?: number;
  elapsedMs?: number;
  userFeedback?: string;
  createTime?: string;
}

/** T3.4 数据源配置 */
export interface Nl2sqlDatasourceVO {
  id?: string;
  name: string;
  host: string;
  port: number;
  username: string;
  password?: string;
  defaultDb?: string;
  params?: string;
  enabled?: boolean;
}

/** 生成 SQL */
export function generateSql(question: string, dbName?: string) {
  return aiRequestClient.post<Nl2sqlGenerateVO>(Nl2sqlApi.GENERATE, {
    question,
    dbName,
  });
}

/** 生成 + 执行 + 解读（T3.4 支持指定数据源） */
export function executeSql(
  question: string,
  dbName?: string,
  datasourceId?: string,
) {
  return aiRequestClient.post<SqlResultVO>(Nl2sqlApi.EXECUTE, {
    question,
    dbName,
    datasourceId,
  });
}

/** 同步 Schema */
export function syncSchema(dbName?: string) {
  return aiRequestClient.post<number>(Nl2sqlApi.SCHEMA_SYNC, undefined, {
    params: { dbName },
  });
}

// ===== T3.7 审计日志 =====

/** 查询审计日志 */
export function listAudits(limit = 50) {
  return aiRequestClient.get<Nl2sqlAuditVO[]>(Nl2sqlApi.AUDITS, {
    params: { limit },
  });
}

/** T3.1 提交反馈（positive/negative） */
export function submitFeedback(id: string, feedback: 'negative' | 'positive') {
  return aiRequestClient.post<void>(
    path(Nl2sqlApi.AUDIT_FEEDBACK, { id }),
    { feedback },
  );
}

// ===== T3.4 多数据源 =====

/** 数据源列表 */
export function listDatasources() {
  return aiRequestClient.get<Nl2sqlDatasourceVO[]>(Nl2sqlApi.DATASOURCES);
}

/** 已启用数据源 */
export function listEnabledDatasources() {
  return aiRequestClient.get<Nl2sqlDatasourceVO[]>(
    Nl2sqlApi.DATASOURCES_ENABLED,
  );
}

/** 保存数据源 */
export function saveDatasource(dto: Nl2sqlDatasourceVO) {
  return aiRequestClient.post<void>(Nl2sqlApi.DATASOURCES, dto);
}

/** 删除数据源 */
export function deleteDatasource(id: string) {
  return aiRequestClient.delete(path(Nl2sqlApi.DATASOURCE_DETAIL, { id }));
}

/** 测试连通性 */
export function testDatasource(id: string) {
  return aiRequestClient.post<boolean>(
    path(Nl2sqlApi.DATASOURCE_TEST, { id }),
  );
}
