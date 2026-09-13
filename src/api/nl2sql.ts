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

// ===== tasks-2609-1400-10 增量：NL2SQL 接口绑定地址 =====
const NL2SQL_URL_KEY = 'ai_assistant_nl2sql_url';

/** 读取 NL2SQL 接口绑定地址（空 = 跟随后端主通道 /ai-api） */
export function getNl2sqlBaseUrl(): string {
  try {
    return localStorage.getItem(NL2SQL_URL_KEY) ?? '';
  } catch {
    return '';
  }
}

/** 保存 NL2SQL 接口绑定地址（清空 = 恢复主通道） */
export function setNl2sqlBaseUrl(url: string) {
  try {
    const v = url.trim();
    if (v) localStorage.setItem(NL2SQL_URL_KEY, v);
    else localStorage.removeItem(NL2SQL_URL_KEY);
  } catch {
    /* 存储不可用时静默 */
  }
}

interface REnvelope<T> {
  code: string | number;
  data?: T;
  message?: string;
  success?: boolean;
}

/**
 * NL2SQL 统一请求入口：
 * - 未绑定地址 → 走主通道 aiRequestClient（同后端 /ai-api）
 * - 绑定了绝对地址（http/https）→ 直连该接口（携带 API Key 鉴权头 + R 信封解包）
 */
export async function nl2sqlRequest<T>(
  method: 'GET' | 'POST' | 'DELETE',
  pathWithQuery: string,
  body?: unknown,
): Promise<T> {
  const base = getNl2sqlBaseUrl();
  if (!/^https?:\/\//i.test(base)) {
    if (method === 'GET') return aiRequestClient.get<T>(pathWithQuery);
    if (method === 'DELETE') return aiRequestClient.delete<T>(pathWithQuery);
    return aiRequestClient.post<T>(pathWithQuery, body);
  }
  let token = '';
  try {
    token = localStorage.getItem('ai_assistant_api_key') ?? '';
  } catch {
    /* ignore */
  }
  const res = await fetch(base.replace(/\/$/, '') + pathWithQuery, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`NL2SQL 接口错误（HTTP ${res.status}）`);
  }
  const json = (await res.json()) as REnvelope<T>;
  if (json.code !== 0 && json.code !== '0') {
    throw new Error(json.message || 'NL2SQL 接口返回失败');
  }
  return json.data as T;
}

/** 绑定地址下的查询串工具（主通道时由 client 处理 params；直连时手工拼接） */
function withQuery(p: string, params: Record<string, string | number | undefined>) {
  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join('&');
  return qs ? `${p}?${qs}` : p;
}

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
  return nl2sqlRequest<Nl2sqlGenerateVO>('POST', Nl2sqlApi.GENERATE, {
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
  return nl2sqlRequest<SqlResultVO>('POST', Nl2sqlApi.EXECUTE, {
    question,
    dbName,
    datasourceId,
  });
}

/** 同步 Schema */
export function syncSchema(dbName?: string) {
  return nl2sqlRequest<number>(
    'POST',
    withQuery(Nl2sqlApi.SCHEMA_SYNC, { dbName }),
  );
}

// ===== T3.7 审计日志 =====

/** 查询审计日志 */
export function listAudits(limit = 50) {
  return nl2sqlRequest<Nl2sqlAuditVO[]>(
    'GET',
    withQuery(Nl2sqlApi.AUDITS, { limit }),
  );
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
