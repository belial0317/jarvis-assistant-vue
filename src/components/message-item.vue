<script lang="ts" setup>
import { createIconifyIcon } from '../providers/icons';

import { computed, reactive } from 'vue';

import type {
  AgentRunStatus,
  ChatMessage,
  DiffAction,
  ToolApprovalRequest,
  ToolStatus,
} from '../types';

import { renderMarkdown } from './markdown';
import DiffBlock from './diff-block.vue';
import SqlResultTable from '../modules/sql-result-table.vue';

defineOptions({ name: 'AiMessageItem' });

const props = defineProps<{ message: ChatMessage }>();
const emit = defineEmits<{
  retry: [];
  /** Diff 审批动作 */
  diffAction: [payload: { messageId: string; patchId: string; action: DiffAction; lineIndex?: number }];
  /** 工具审批动作 */
  toolApproval: [payload: { messageId: string; approvalId: string; approved: boolean }];
}>();

const CheckIcon = createIconifyIcon('lucide:check');
const LoaderIcon = createIconifyIcon('lucide:loader');
const XIcon = createIconifyIcon('lucide:x');
const ShieldIcon = createIconifyIcon('lucide:shield-alert');
const CopyIcon = createIconifyIcon('lucide:copy');
const RefreshIcon = createIconifyIcon('lucide:rotate-ccw');
const AlertIcon = createIconifyIcon('lucide:alert-triangle');
const BotIcon = createIconifyIcon('lucide:bot');
const TerminalIcon = createIconifyIcon('lucide:terminal');

const isUser = computed(() => props.message.role === 'user');
const isAssistant = computed(() => props.message.role === 'assistant');
const streaming = computed(() => props.message.status === 'streaming');
const pending = computed(() => props.message.status === 'pending');
const html = computed(() => renderMarkdown(props.message.content));

const expandedMap = reactive<Record<string, boolean>>({});
function toggle(id: string) {
  expandedMap[id] = !expandedMap[id];
}

const TOOL_ICON: Record<ToolStatus, any> = {
  error: XIcon,
  pending_approval: ShieldIcon,
  running: LoaderIcon,
  success: CheckIcon,
};
const TOOL_COLOR: Record<ToolStatus, string> = {
  error: 'text-red-500',
  pending_approval: 'text-amber-500',
  running: 'text-blue-500',
  success: 'text-emerald-500',
};
const TOOL_TEXT: Record<ToolStatus, string> = {
  error: '失败',
  pending_approval: '待授权',
  running: '运行中',
  success: '完成',
};

// Agent 状态徽章
const AGENT_PHASE_TEXT: Record<AgentRunStatus['phase'], string> = {
  idle: '空闲',
  planning: '规划中',
  running: '执行中',
  waiting_approval: '等待授权',
  waiting_diff_review: '等待 Diff 审批',
  completed: '已完成',
  error: '错误',
};
const AGENT_PHASE_COLOR: Record<AgentRunStatus['phase'], string> = {
  idle: 'text-muted-foreground',
  planning: 'text-blue-500',
  running: 'text-blue-500',
  waiting_approval: 'text-amber-500',
  waiting_diff_review: 'text-amber-500',
  completed: 'text-emerald-500',
  error: 'text-red-500',
};

// 风险等级样式
const RISK_STYLE: Record<ToolApprovalRequest['risk'], { label: string; class: string }> = {
  low: { label: '低风险', class: 'text-emerald-600 bg-emerald-500/10' },
  medium: { label: '中风险', class: 'text-amber-600 bg-amber-500/10' },
  high: { label: '高风险', class: 'text-red-600 bg-red-500/10' },
};

// 待处理的工具审批（status='pending'）
const pendingApprovals = computed(
  () => props.message.toolApprovals?.filter((a) => a.status === 'pending') ?? [],
);

function onDiffAction(payload: { patchId: string; action: DiffAction; lineIndex?: number }) {
  emit('diffAction', { messageId: props.message.id, ...payload });
}

function onApprove(approval: ToolApprovalRequest) {
  emit('toolApproval', { messageId: props.message.id, approvalId: approval.approvalId, approved: true });
}

function onReject(approval: ToolApprovalRequest) {
  emit('toolApproval', { messageId: props.message.id, approvalId: approval.approvalId, approved: false });
}

// 格式化工具参数展示
function formatArgs(args: Record<string, any>): string {
  try {
    return JSON.stringify(args, null, 2);
  } catch {
    return String(args);
  }
}

async function copyContent() {
  try {
    await navigator.clipboard.writeText(props.message.content);
  } catch {
    // 忽略剪贴板权限失败
  }
}
</script>

<template>
  <div class="msg-row flex gap-2" :class="isUser ? 'flex-row-reverse' : 'flex-row'">
    <div
      v-if="isAssistant"
      class="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-medium text-primary"
    >
      AI
    </div>

    <div class="flex min-w-0 max-w-[82%] flex-col gap-1.5" :class="isUser ? 'items-end' : 'items-start'">
      <!-- 思考过程 -->
      <div
        v-if="message.reasoning && isAssistant"
        class="w-full rounded-md border border-dashed border-border bg-muted/40 px-2.5 py-1 text-[12px] text-muted-foreground"
      >
        <div class="flex items-center gap-1 font-medium">
          <component :is="LoaderIcon" class="h-3 w-3" />
          思考过程
        </div>
        <div class="mt-1 leading-5">{{ message.reasoning }}</div>
      </div>

      <!-- 气泡 -->
      <div
        v-if="message.content || streaming"
        class="rounded-[10px] px-3 py-2 text-[13px] leading-5"
        :class="
          isUser
            ? 'rounded-br-sm bg-primary text-primary-foreground'
            : 'rounded-bl-sm border border-border bg-card text-foreground'
        "
      >
        <div class="md-body" v-html="html"></div>
        <span v-if="streaming" class="cursor-blink">▋</span>
      </div>

      <!-- NL2SQL 查询结果（表格/图表，SQL 已脱敏不展示） -->
      <SqlResultTable
        v-if="isAssistant && message.sqlResult"
        :result="message.sqlResult"
        class="mt-2 w-full"
      />

      <!-- pending 占位（等待首个 chunk 到达） -->
      <div
        v-else-if="isAssistant && pending"
        class="flex items-center gap-1.5 rounded-[10px] rounded-bl-sm border border-border bg-card px-3 py-2 text-[13px] text-muted-foreground"
      >
        <component :is="LoaderIcon" class="h-3.5 w-3.5 animate-spin" />
        <span>思考中...</span>
      </div>

      <!-- Agent 运行时状态 -->
      <div
        v-if="isAssistant && message.agentStatus"
        class="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-2.5 py-1 text-[11px]"
      >
        <component :is="BotIcon" class="h-3.5 w-3.5 flex-shrink-0 text-primary" />
        <span class="font-medium">Agent</span>
        <span :class="AGENT_PHASE_COLOR[message.agentStatus.phase]">
          {{ AGENT_PHASE_TEXT[message.agentStatus.phase] }}
        </span>
        <span class="text-muted-foreground">
          · 第 {{ message.agentStatus.iteration }}/{{ message.agentStatus.maxIterations }} 轮
        </span>
        <span
          v-if="message.agentStatus.currentTool"
          class="text-muted-foreground"
        >
          · {{ message.agentStatus.currentTool }}
        </span>
        <component
          :is="LoaderIcon"
          v-if="message.agentStatus.phase === 'running' || message.agentStatus.phase === 'planning'"
          class="h-3 w-3 animate-spin text-blue-500"
        />
      </div>

      <!-- Diff 审批块 -->
      <DiffBlock
        v-for="patch in message.diffs"
        :key="patch.id"
        :patch="patch"
        :readonly="patch.status === 'accepted' || patch.status === 'rejected'"
        @action="onDiffAction"
      />

      <!-- 工具审批卡片 -->
      <div
        v-for="approval in pendingApprovals"
        :key="approval.approvalId"
        class="w-full overflow-hidden rounded-lg border border-amber-500/40 bg-amber-500/5 text-[12px]"
      >
        <div class="flex items-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-3 py-2">
          <component :is="ShieldIcon" class="h-4 w-4 flex-shrink-0 text-amber-600" />
          <span class="font-medium">工具执行授权</span>
          <span class="text-muted-foreground">{{ approval.toolName }}</span>
          <span
            v-if="approval.serverName"
            class="text-muted-foreground"
          >· {{ approval.serverName }}</span>
          <span
            class="ml-auto rounded px-1.5 py-0.5 text-[10px] font-medium"
            :class="RISK_STYLE[approval.risk].class"
          >
            {{ RISK_STYLE[approval.risk].label }}
          </span>
        </div>
        <!-- 风险说明 -->
        <div
          v-if="approval.riskDescription"
          class="flex items-start gap-1.5 border-b border-amber-500/20 bg-amber-500/5 px-3 py-1.5 text-[11px] text-amber-700"
        >
          <component :is="AlertIcon" class="mt-0.5 h-3 w-3 flex-shrink-0" />
          <span>{{ approval.riskDescription }}</span>
        </div>
        <!-- 工具参数 -->
        <div class="px-3 py-2">
          <div class="mb-1 flex items-center gap-1 text-[11px] text-muted-foreground">
            <component :is="TerminalIcon" class="h-3 w-3" />
            <span>执行参数</span>
          </div>
          <pre class="overflow-x-auto rounded bg-muted/40 px-2 py-1.5 font-mono text-[11px] leading-4">{{ formatArgs(approval.args) }}</pre>
        </div>
        <!-- 审批按钮 -->
        <div class="flex items-center justify-end gap-1.5 border-t border-amber-500/30 bg-amber-500/5 px-3 py-2">
          <button
            type="button"
            class="flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            @click="onReject(approval)"
          >
            <component :is="XIcon" class="h-3 w-3" />
            拒绝
          </button>
          <button
            type="button"
            class="flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1 text-[11px] font-medium text-white transition-colors hover:bg-emerald-700"
            @click="onApprove(approval)"
          >
            <component :is="CheckIcon" class="h-3 w-3" />
            授权执行
          </button>
        </div>
      </div>

      <!-- 工具调用卡片 -->
      <div
        v-for="tc in message.toolCalls"
        :key="tc.id"
        class="w-full overflow-hidden rounded-lg border border-border bg-card text-[12px]"
      >
        <button
          type="button"
          class="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-accent"
          @click="toggle(tc.id)"
        >
          <component
            :is="TOOL_ICON[tc.status]"
            class="h-3.5 w-3.5 flex-shrink-0"
            :class="[TOOL_COLOR[tc.status], tc.status === 'running' ? 'animate-spin' : '']"
          />
          <span class="font-medium">{{ tc.name }}</span>
          <span v-if="tc.serverName" class="text-muted-foreground">· {{ tc.serverName }}</span>
          <span class="ml-auto flex items-center gap-2">
            <span :class="TOOL_COLOR[tc.status]">
              {{ TOOL_TEXT[tc.status] }}
              <template v-if="tc.duration"> · {{ tc.duration }}ms</template>
            </span>
          </span>
        </button>
        <div v-if="expandedMap[tc.id]" class="space-y-1 border-t border-border bg-background-deep px-3 py-2">
          <div class="flex gap-2">
            <span class="text-muted-foreground">参数</span>
            <code class="break-all text-[11px]">{{ JSON.stringify(tc.args) }}</code>
          </div>
          <div v-if="tc.result" class="flex gap-2">
            <span class="text-muted-foreground">结果</span>
            <span>{{ tc.result }}</span>
          </div>
        </div>
      </div>

      <!-- 错误 -->
      <div
        v-if="message.status === 'error'"
        class="flex items-center gap-2 rounded-md border border-red-500/40 bg-red-500/10 px-2.5 py-1 text-[12px] text-red-500"
      >
        <component :is="XIcon" class="h-3.5 w-3.5" />
        <span>{{ message.error || '生成失败' }}</span>
        <button class="ml-1 underline" @click="$emit('retry')">重试</button>
      </div>

      <!-- 操作条（助手消息完成态） -->
      <div
        v-if="isAssistant && message.status === 'complete' && message.content"
        class="flex items-center gap-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
      >
        <button
          class="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] hover:bg-accent hover:text-foreground"
          @click="copyContent"
        >
          <component :is="CopyIcon" class="h-3 w-3" /> 复制
        </button>
        <button
          class="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] hover:bg-accent hover:text-foreground"
          @click="$emit('retry')"
        >
          <component :is="RefreshIcon" class="h-3 w-3" /> 重新生成
        </button>
        <span v-if="message.tokens" class="px-1 text-[11px] text-muted-foreground/70">
          ↑{{ message.tokens.input }} ↓{{ message.tokens.output }}
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cursor-blink {
  display: inline-block;
  margin-left: 1px;
  animation: blink 1s steps(2, start) infinite;
  color: var(--primary);
}
@keyframes blink {
  to {
    visibility: hidden;
  }
}

.md-body {
  word-break: break-word;
}
.md-body :deep(p) {
  margin: 0 0 6px;
}
.md-body :deep(p:last-child) {
  margin-bottom: 0;
}
.md-body :deep(.md-ul) {
  margin: 4px 0;
  padding-left: 18px;
  list-style: disc;
}
.md-body :deep(.md-ul li) {
  margin: 2px 0;
}
.md-body :deep(.md-inline-code) {
  padding: 1px 5px;
  border-radius: 4px;
  background: rgb(0 0 0 / 8%);
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 12px;
}
:global([data-theme='dark']) .md-body :deep(.md-inline-code) {
  background: rgb(255 255 255 / 10%);
}
.md-body :deep(.md-code-wrap) {
  margin: 6px 0;
  border-radius: 8px;
  border: 1px solid hsl(var(--border));
  overflow: hidden;
}
.md-body :deep(.md-code-head) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 10px;
  background: hsl(var(--muted));
  font-size: 11px;
}
.md-body :deep(.md-code-lang) {
  color: hsl(var(--muted-foreground));
  text-transform: lowercase;
}
.md-body :deep(.md-code-copy) {
  cursor: pointer;
  color: hsl(var(--muted-foreground));
}
.md-body :deep(.md-code-copy:hover) {
  color: hsl(var(--foreground));
}
.md-body :deep(.md-code) {
  margin: 0;
  padding: 10px 12px;
  overflow-x: auto;
  background: hsl(var(--primary) / 0.03);
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 12px;
  line-height: 18px;
}
</style>