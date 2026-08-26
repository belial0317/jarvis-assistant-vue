/**
 * AI 助手 API：插件市场
 *
 * 数据来源分两处（设计 P2，见 project/docs/memory/tasks-2608-2521-35）：
 * - 目录：门户运营平台 catalogURL（跨系统只读，宿主经 config.market.catalogURL 注入）
 * - 安装态：本系统 /mcp/servers（复用注册协议，安装 = 注册 MCP server）
 *
 * 目录项 → 注册字段映射约定（plugin-registry-protocol.md）：
 *   name = market-{pluginCode}（幂等判重）/ transport = endpoint.transport / url = endpoint.url
 */
import type { McpServer } from '../types';

import { useAiAssistantConfig } from '../providers';

import { aiRequestClient } from './client';
import { McpApi, path } from './endpoints';
import {
  deleteMcpServer,
  type McpSaveDTO,
  saveMcpServer,
  testMcpConnection,
  toggleMcpServerEnabled,
} from './mcp';

/** 门户插件目录项（门户侧契约提案，待门户确认） */
export interface MarketPlugin {
  /** 插件唯一编码（安装后注册名为 market-{pluginCode}） */
  pluginCode: string;
  name: string;
  icon?: string;
  description: string;
  category: string;
  version: string;
  rating?: number;
  provider: string;
  /** 工具清单（名称 + 一句话描述，仅展示用） */
  tools: Array<{ name: string; description: string }>;
  /** 鉴权说明（展示用）；密钥类凭据经 endpoint.headers 静态注入 */
  authNote?: string;
  /** 更新记录 */
  updates?: Array<{ version: string; note: string }>;
  /** 安装所需的端点信息（门户托管实例） */
  endpoint: {
    transport: 'sse' | 'stdio' | 'streamable-http';
    url?: string;
    command?: string;
    headers?: Array<{ key: string; value: string }>;
  };
}

/** 拉取门户目录。catalogURL 未配置或不可达时返回 null（降级为仅已安装） */
export async function fetchMarketCatalog(): Promise<MarketPlugin[] | null> {
  const config = useAiAssistantConfig();
  const catalogURL = config.market?.catalogURL;
  if (!catalogURL) {
    return null;
  }
  try {
    const response = await fetch(catalogURL, { headers: { Accept: 'application/json' } });
    if (!response.ok) {
      return null;
    }
    const body = await response.json();
    // 兼容 {data:[...]} 包裹与裸数组两种形态
    const list = Array.isArray(body) ? body : body?.data;
    return Array.isArray(list) ? (list as MarketPlugin[]) : null;
  } catch {
    return null;
  }
}

/** 已安装清单（后端聚合：目录信息 ⋈ mcp 运行状态） */
export interface InstalledPlugin {
  serverId: string;
  pluginCode: string;
  name?: string;
  icon?: string;
  description?: string;
  category?: string;
  provider?: string;
  ui?: MarketPluginUi;
  status?: string;
  enabled?: boolean;
  lastError?: string;
}

/** UI 插件页面声明（schema-page，声明式无代码） */
export interface MarketPluginUi {
  type: 'schema-page';
  page: SchemaPage;
}

export interface SchemaPage {
  title?: string;
  sections: SchemaSection[];
}

export type SchemaSection =
  | {
      type: 'stats';
      cards: Array<{ label: string; unit?: string; tool: string; field: string }>;
    }
  | {
      type: 'list';
      title?: string;
      tool: string;
      columns: Array<{ key: string; label: string }>;
      dataField?: string;
    }
  | {
      type: 'form';
      title?: string;
      fields: Array<{
        key: string;
        label: string;
        type: 'date' | 'number' | 'select' | 'text';
        options?: string[];
      }>;
      submit: { label: string; tool: string; resultField?: string; asTable?: boolean };
    };

export async function listInstalledPlugins(): Promise<InstalledPlugin[]> {
  return aiRequestClient.get<InstalledPlugin[]>('/market/installed');
}

/** UI 页面数据源：直调已安装插件的工具（渲染器限定只能调本插件清单内工具） */
export function invokeTool(
  serverId: string,
  toolName: string,
  args?: Record<string, unknown>,
): Promise<string> {
  return aiRequestClient.post<string>(
    path(McpApi.INVOKE, { id: serverId, toolName }),
    args ?? {},
  );
}

/** 目录项 → 本系统注册 DTO（映射约定见文件头） */
export function toMcpSaveDTO(plugin: MarketPlugin): McpSaveDTO {
  return {
    name: `market-${plugin.pluginCode}`,
    description: plugin.description,
    transport: plugin.endpoint.transport,
    url: plugin.endpoint.url,
    command: plugin.endpoint.command,
    headers: plugin.endpoint.headers,
    enabled: true,
  };
}

/** 安装三步编排：注册 → 连通测试（含状态回写）→ 工具清单确认（详见设计 P3） */
export async function installMarketPlugin(
  plugin: MarketPlugin,
  onStep?: (step: 0 | 1 | 2) => void,
): Promise<{ server: McpServer; toolCount: number }> {
  onStep?.(0);
  await saveMcpServer(toMcpSaveDTO(plugin));
  onStep?.(1);
  const server = await testMcpConnectionByName(`market-${plugin.pluginCode}`);
  // testConnection 失败不抛异常（仅回写 status=error），此处显式判定连通结果，
  // 避免"注册成功但插件不可用"被误报为安装成功（八荣八耻第 2/5 条）
  if (!server || server.status !== 'connected') {
    throw new Error(
      `连通测试失败：${server?.lastError ?? '插件端点不可达'}（已注册，恢复后可重试或经健康探测自愈）`,
    );
  }
  let toolCount = 0;
  onStep?.(2);
  if (server?.id) {
    try {
      const tools = await aiRequestClient.get<unknown[]>(
        path(McpApi.TOOLS, { id: server.id }),
      );
      toolCount = tools?.length ?? 0;
    } catch {
      // 工具清单拉取失败不阻断安装（test 已验证连通；清单可后续 refresh）
    }
  }
  return { server, toolCount };
}

async function testMcpConnectionByName(name: string): Promise<McpServer> {
  const servers = await aiRequestClient.get<McpServer[]>(McpApi.LIST, {
    params: { keyword: name, pageSize: 10 },
  });
  const target = servers.find((s) => s.name === name);
  if (!target?.id) {
    throw new Error(`插件注册后未找到对应记录: ${name}`);
  }
  return testMcpConnection(target.id);
}

export { deleteMcpServer, toggleMcpServerEnabled };
