<script setup lang="ts">
/**
 * T0 交互原型：智能体路径诊断窗口（只读诊断，不做任何编辑能力）。
 * 验证点：点击节点/请求边/返回边联动详情；同名并行 callKey 分组；
 * 仅观测到实际返回才画返回边；嵌套 childTrace 入口；缩放/平移。
 * T3 正式实现将把 mock 数据替换为 overview/detail API。
 */
import { computed, onMounted, ref } from 'vue';
import { VueFlow, useVueFlow } from '@vue-flow/core';
import '@vue-flow/core/dist/style.css';
import '@vue-flow/core/dist/theme-default.css';
import {
  layoutTrace,
  statusText,
  type TraceDetailLike,
  type TraceEdgeLike,
  type TraceParticipant,
  type TraceSpanLike,
} from './traceLayout';

const participants: TraceParticipant[] = [
  { id: 'user', type: 'user', label: '用户' },
  { id: 'chat', type: 'service', label: 'ChatService' },
  { id: 'agent:1', type: 'agent', label: '默认 Agent' },
  { id: 'kb:12', type: 'knowledge', label: '产品文档库' },
  { id: 'tool:query_db', type: 'tool', label: 'query_db' },
  { id: 'tool:fail_tool', type: 'tool', label: 'fail_tool' },
  { id: 'tool:sandbox', type: 'tool', label: 'sandbox_read_file' },
  { id: 'subagent:research', type: 'agent', label: '研究子 Agent' },
];

const spans: TraceSpanLike[] = [
  { spanId: 's01', parentSpanId: null, sequenceNo: 10, kind: 'user_request', label: '用户请求', fromParticipantId: 'user', toParticipantId: 'chat', executionStatus: 'success', resultKind: null, durationMs: 2, callKey: null, childTraceId: null },
  { spanId: 's02', parentSpanId: 's01', sequenceNo: 20, kind: 'agent_resolve', label: '选择 Agent', fromParticipantId: 'chat', toParticipantId: 'agent:1', executionStatus: 'success', resultKind: null, durationMs: 30, callKey: null, childTraceId: null },
  { spanId: 's03', parentSpanId: 's02', sequenceNo: 30, kind: 'skill_match', label: 'Skill 匹配 /未应用', fromParticipantId: 'chat', toParticipantId: 'agent:1', executionStatus: 'success', resultKind: null, durationMs: 5, callKey: null, childTraceId: null },
  { spanId: 's04', parentSpanId: 's02', sequenceNo: 40, kind: 'knowledge_search', label: '知识检索 命中3', fromParticipantId: 'agent:1', toParticipantId: 'kb:12', executionStatus: 'success', resultKind: null, durationMs: 210, callKey: null, childTraceId: null },
  { spanId: 's05', parentSpanId: 's02', sequenceNo: 50, kind: 'knowledge_inject', label: '注入上下文', fromParticipantId: 'kb:12', toParticipantId: 'agent:1', executionStatus: 'success', resultKind: null, durationMs: 12, callKey: null, childTraceId: null },
  { spanId: 's06', parentSpanId: 's02', sequenceNo: 60, kind: 'model_call', label: '模型调用(第1轮)', fromParticipantId: 'agent:1', toParticipantId: 'agent:1', executionStatus: 'success', resultKind: null, durationMs: 1200, callKey: null, childTraceId: null },
  { spanId: 's07', parentSpanId: 's06', sequenceNo: 70, kind: 'tool_call', label: 'query_db(并行#1)', fromParticipantId: 'agent:1', toParticipantId: 'tool:query_db', executionStatus: 'success', resultKind: 'ok', durationMs: 300, callKey: 'ck-a', childTraceId: null },
  { spanId: 's08', parentSpanId: 's06', sequenceNo: 71, kind: 'tool_call', label: 'query_db(并行#2)', fromParticipantId: 'agent:1', toParticipantId: 'tool:query_db', executionStatus: 'success', resultKind: 'ok', durationMs: 280, callKey: 'ck-b', childTraceId: null },
  { spanId: 's09', parentSpanId: 's06', sequenceNo: 80, kind: 'tool_call', label: 'fail_tool(业务错误)', fromParticipantId: 'agent:1', toParticipantId: 'tool:fail_tool', executionStatus: 'success', resultKind: 'business_error', durationMs: 150, callKey: null, childTraceId: null },
  { spanId: 's10', parentSpanId: 's06', sequenceNo: 90, kind: 'tool_call', label: '审批拒绝工具', fromParticipantId: 'agent:1', toParticipantId: 'tool:sandbox', executionStatus: 'denied', resultKind: null, durationMs: null, callKey: null, childTraceId: null },
  { spanId: 's11', parentSpanId: 's06', sequenceNo: 100, kind: 'subagent_spawn', label: '创建研究子Agent(后台)', fromParticipantId: 'agent:1', toParticipantId: 'subagent:research', executionStatus: 'success', resultKind: null, durationMs: 40, callKey: null, childTraceId: 'childTrace-1' },
  { spanId: 's12', parentSpanId: 's06', sequenceNo: 110, kind: 'task_output', label: '后台结果收割', fromParticipantId: 'subagent:research', toParticipantId: 'agent:1', executionStatus: 'background', resultKind: null, durationMs: null, callKey: null, childTraceId: null },
  { spanId: 's13', parentSpanId: 's02', sequenceNo: 120, kind: 'final_answer', label: '最终回复', fromParticipantId: 'agent:1', toParticipantId: 'chat', executionStatus: 'success', resultKind: null, durationMs: 90, callKey: null, childTraceId: null },
  { spanId: 's14', parentSpanId: 's06', sequenceNo: 130, kind: 'tool_call', label: '后台工具(未返回)', fromParticipantId: 'agent:1', toParticipantId: 'tool:sandbox', executionStatus: 'not_observed', resultKind: null, durationMs: null, callKey: null, childTraceId: null },
];

const edges: TraceEdgeLike[] = [];

const details: Record<string, TraceDetailLike> = {
  s07: { input: { format: 'json', data: { sql: 'SELECT count(*) FROM orders' }, visibility: { visible: true } }, output: { format: 'json', data: { rows: 1 }, visibility: { visible: true, redacted: false } }, error: null },
  s09: { input: { format: 'json', data: { cmd: 'simulate-failure' }, visibility: { visible: true } }, output: { format: 'json', data: { exitCode: 1 }, visibility: { visible: true } }, error: { code: 'SANDBOX_EXIT_NONZERO', message: '沙箱退出码非零' } },
  s10: { input: { format: 'json', data: { path: 'secret.txt' }, visibility: { visible: true, redacted: true } }, output: null, error: { code: 'DENIED_BY_USER', message: '用户拒绝该工具调用' } },
};

const layout = computed(() => layoutTrace(spans, edges, participants));

const { fitView } = useVueFlow();

onMounted(() => {
  // 容器尺寸就绪后再适配视口，避免 fit-view-on-init 在 0 尺寸时失效
  setTimeout(() => fitView({ padding: 0.15 }), 120);
});

const flowNodes = computed(() =>
  layout.value.nodes.map((n) => ({
    id: n.id,
    position: { x: n.x, y: n.y },
    data: { label: `${n.label}\n${statusText(n.executionStatus, n.resultKind ?? null)}` },
    class: `span-node status-${n.executionStatus}`,
    draggable: false,
    connectable: false,
  })),
);

const flowEdges = computed(() =>
  layout.value.layoutEdges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.direction === 'return' ? '↩ 返回' : undefined,
    animated: e.direction === 'request',
    class: e.direction === 'return' ? 'edge-return' : 'edge-request',
    style: e.direction === 'return' ? { stroke: '#8c8c8c', strokeDasharray: '6 3' } : { stroke: '#1677ff' },
  })),
);

const selectedSpanId = ref<string | null>(null);
const selectedKind = ref<'span' | 'edge'>('span');

function select(spanId: string, kind: 'span' | 'edge' = 'span') {
  selectedSpanId.value = spanId;
  selectedKind.value = kind;
}

const selectedSpan = computed(() => spans.find((s) => s.spanId === selectedSpanId.value) ?? null);
const selectedDetail = computed(() => (selectedSpanId.value ? details[selectedSpanId.value] ?? null : null));

function onNodeClick(e: { node: { id: string } }) {
  select(e.node.id, 'span');
}
function onEdgeClick(e: { edge: { id: string } }) {
  const id = e.edge.id.replace(/^ret-|^req-/, '');
  select(id, 'edge');
}
</script>

<template>
  <div class="agent-trace-demo">
    <div class="trace-header">
      <span>智能体路径（T0 原型 · 只读）</span>
      <span class="integrity">主回复 completed · integrity partial（后台未返回）</span>
    </div>
    <div class="trace-body">
      <div class="flow-pane">
        <VueFlow
          :nodes="flowNodes"
          :edges="flowEdges"
          :nodes-draggable="false"
          :nodes-connectable="false"
          :edges-updatable="false"
          :elements-selectable="true"
          fit-view-on-init
          @node-click="onNodeClick"
          @edge-click="onEdgeClick"
        />
      </div>
      <div class="detail-pane">
        <template v-if="selectedSpan">
          <h4>{{ selectedSpan.label }}</h4>
          <p>spanId: {{ selectedSpan.spanId }}</p>
          <p>状态: {{ statusText(selectedSpan.executionStatus, selectedSpan.resultKind ?? null) }}</p>
          <p>耗时: {{ selectedSpan.durationMs != null ? `${selectedSpan.durationMs}ms` : '未返回' }}</p>
          <p>callKey: {{ selectedSpan.callKey ?? '-' }}</p>
          <p v-if="selectedSpan.childTraceId">childTraceId: {{ selectedSpan.childTraceId }}</p>
          <div v-if="selectedDetail?.input" class="detail-block">
            <b>输入</b>
            <pre>{{ JSON.stringify(selectedDetail.input.data, null, 2) }}</pre>
          </div>
          <div v-if="selectedDetail?.output" class="detail-block">
            <b>输出</b>
            <pre>{{ JSON.stringify(selectedDetail.output.data, null, 2) }}</pre>
          </div>
          <div v-if="selectedDetail?.error" class="detail-block error">
            <b>错误</b>
            <pre>{{ selectedDetail.error.code }}: {{ selectedDetail.error.message }}</pre>
          </div>
          <p v-if="!selectedDetail" class="detail-empty">该步骤无按需详情（或未记录）</p>
        </template>
        <template v-else>
          <p class="detail-empty">点击左侧节点或箭头查看执行详情</p>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.agent-trace-demo { display: flex; flex-direction: column; height: 70vh; border: 1px solid #d9d9d9; border-radius: 8px; overflow: hidden; }
.trace-header { display: flex; justify-content: space-between; padding: 8px 12px; background: #f5f5f5; }
.trace-body { display: flex; flex: 1; min-height: 0; }
.flow-pane { flex: 1; }
.detail-pane { width: 320px; border-left: 1px solid #d9d9d9; padding: 12px; overflow: auto; background: #fafafa; }
.detail-block { margin-top: 8px; }
.detail-block pre { background: #fff; padding: 6px; font-size: 12px; white-space: pre-wrap; }
.detail-block.error pre { background: #fff1f0; }
.detail-empty { color: #999; }
.span-node { font-size: 12px; }
</style>