/**
 * AI 助手 API：MCP 模块
 */
import type { McpServer, McpTool } from '../types';

import { aiRequestClient } from './client';
import { McpApi, path } from './endpoints';

export type McpServerVO = McpServer;

export interface McpQueryDTO {
  keyword?: string;
  transport?: string;
  enabled?: boolean;
  pageNum?: number;
  pageSize?: number;
}

export interface McpSaveDTO {
  id?: string;
  name: string;
  description?: string;
  transport: 'sse' | 'stdio' | 'streamable-http';
  command?: string;
  args?: string[];
  env?: Array<{ key: string; value: string }>;
  url?: string;
  headers?: Array<{ key: string; value: string }>;
  configuration?: { timeout: number; sseReadTimeout: number };
  identityMode?: 'off' | 'idp_token';
  enabled?: boolean;
  // OAuth 认证（identityMode=idp_token 时）
  authentication?: { clientId: string; tokenEndpoint?: string };
  clientSecret?: string;
}

export function listMcpServers(params?: McpQueryDTO) {
  return aiRequestClient.get<McpServerVO[]>(McpApi.LIST, { params });
}

export function getMcpServer(id: string) {
  return aiRequestClient.get<McpServerVO>(path(McpApi.DETAIL, { id }));
}

export function saveMcpServer(dto: McpSaveDTO) {
  // 后端 DTO 复杂字段均为 JSON 字符串（args: string[] / env·headers: Array<{key,value}> /
  // configuration·authentication: 对象），组件内对象形态在此统一序列化（与 knowledge.ts 同模式）
  const payload = {
    ...dto,
    args: Array.isArray(dto.args) ? JSON.stringify(dto.args) : dto.args,
    env: Array.isArray(dto.env) ? JSON.stringify(dto.env) : dto.env,
    headers: Array.isArray(dto.headers) ? JSON.stringify(dto.headers) : dto.headers,
    configuration:
      dto.configuration != null && typeof dto.configuration === 'object'
        ? JSON.stringify(dto.configuration)
        : dto.configuration,
    authentication:
      dto.authentication != null && typeof dto.authentication === 'object'
        ? JSON.stringify(dto.authentication)
        : dto.authentication,
  };
  return aiRequestClient.post<string>(McpApi.SAVE, payload);
}

export function deleteMcpServer(id: string) {
  return aiRequestClient.delete(path(McpApi.DELETE, { id }));
}

/** 切换 MCP 服务器启用状态 */
export function toggleMcpServerEnabled(id: string, enabled: boolean) {
  return aiRequestClient.request<void>(
    path(McpApi.TOGGLE_ENABLED, { id }),
    { method: 'PATCH', params: { enabled } },
  );
}

export function testMcpConnection(id: string) {
  return aiRequestClient.post<McpServerVO>(path(McpApi.TEST, { id }));
}

export function listMcpTools(id: string) {
  return aiRequestClient.get<McpTool[]>(path(McpApi.TOOLS, { id }));
}

/** 强制刷新工具列表（重新调用外部 MCP Server） */
export function refreshMcpTools(id: string) {
  return aiRequestClient.post<McpTool[]>(path(McpApi.REFRESH_TOOLS, { id }));
}

/** T20：更新工具审批策略（确认卡"始终允许"）；policy: never/always/once */
export function updateToolApprovalPolicy(
  serverName: string,
  toolName: string,
  policy: 'always' | 'never' | 'once',
) {
  return aiRequestClient.patch<boolean>('/mcp/tools/approval-policy', undefined, {
    params: { serverName, toolName, policy },
  });
}
