/**
 * AI 助手 API：Agent 模块
 */
import type {
  Agent,
  DesensitizeRule,
  OutputOptimization,
} from '../types';

import { aiRequestClient } from './client';
import { AgentApi, path } from './endpoints';

export type AgentVO = Agent;

export interface AgentQueryDTO {
  keyword?: string;
  enabled?: boolean;
  pageNum?: number;
  pageSize?: number;
}

export interface AgentSaveDTO {
  id?: string;
  name: string;
  avatar?: string;
  description?: string;
  routeKeywords?: string;
  systemPrompt?: string;
  desensitizeRules?: DesensitizeRule[];
  outputOptimization?: OutputOptimization;
  allowedTools?: string[];
  allowedMcpServers?: string[];
  allowedSkills?: string[];
  allowedKnowledgeBases?: string[];
  modelId?: string;
  modelParams?: { temperature: number; maxTokens: number; topP: number };
  strategy?: 'function_calling' | 'react';
  maxIterations?: number;
  permissions?: {
    fileRead: 'cwd' | 'global' | 'none';
    fileWrite: 'cwd' | 'global' | 'none';
    commandExec: boolean;
    commandWhitelist: string[];
  };
  enabled?: boolean;
}

export function listAgents(params?: AgentQueryDTO) {
  return aiRequestClient.get<AgentVO[]>(AgentApi.LIST, { params });
}

export function listEnabledAgents() {
  return aiRequestClient.get<AgentVO[]>(AgentApi.ENABLED);
}

export function getAgent(id: string) {
  return aiRequestClient.get<AgentVO>(path(AgentApi.DETAIL, { id }));
}

export function saveAgent(dto: AgentSaveDTO) {
  return aiRequestClient.post<string>(AgentApi.SAVE, dto);
}

export function deleteAgent(id: string) {
  return aiRequestClient.delete(path(AgentApi.DELETE, { id }));
}

export function toggleAgentEnabled(id: string, enabled: boolean) {
  return aiRequestClient.request<void>(
    path(AgentApi.TOGGLE_ENABLED, { id }),
    { method: 'PATCH', params: { enabled } },
  );
}
