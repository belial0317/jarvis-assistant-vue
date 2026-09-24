<script setup lang="ts">
/**
 * 智能体路径诊断窗口（T3 正式实现）。
 * 数据来自 overview/detail API；图只是导航，详情面板是核心。
 * 状态四类分离：runStatus/integrity/spanStatus/resultKind 分别渲染。
 */
import { computed, ref, watch } from 'vue';
import { Modal as AntModal, Tag as AntTag } from 'ant-design-vue';
import { VueFlow, useVueFlow } from '@vue-flow/core';
import '@vue-flow/core/dist/style.css';
import '@vue-flow/core/dist/theme-default.css';
import { useAgentTrace } from '../../composables/use-agent-trace';
import { layoutTrace, statusText, type TraceDetailLike } from './traceLayout';

const props = defineProps<{
  open: boolean;
  messageId: string;
}>();

const emit = defineEmits<{ close: [] }>();

const { overview, detailCache, loading, loadingDetail, error, load, loadMore, loadDetail } = useAgentTrace();
const { fitView } = useVueFlow();

const selectedSpanId = ref<string | null>(null);

watch(
  () => [props.open, props.messageId] as const,
  ([open, messageId]) => {
    if (open && messageId) {
      selectedSpanId.value = null;
      void load(messageId);
    }
  },
  { immediate: true },
);

function onOpened() {
  setTimeout(() => fitView({ padding: 0.15 }), 120);
}

const spans = computed(() => overview.value?.spans ?? []);
const layout = computed(() => layoutTrace(spans.value, [], []));

const flowNodes = computed(() =>
  layout.value.nodes.map((n) => ({
    id: n.id,
    position: { x: n.x, y: n.y },
    data: { label: `${n.label}\n${statusText(n.executionStatus, n.resultKind)}` },
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
    label: e.direction === 'return' ? '↩' : undefined,
    animated: e.direction === 'request',
    class: e.direction === 'return' ? 'edge-return' : 'edge-request',
    style: e.direction === 'return' ? { stroke: '#8c8c8c', strokeDasharray: '6 3' } : { stroke: '#1677ff' },
  })),
);

const selectedSpan = computed(() => spans.value.find((s) => s.spanId === selectedSpanId.value) ?? null);
const selectedDetail = computed(() =>
  selectedSpanId.value ? detailCache.value.get(selectedSpanId.value) ?? null : null,
);

function onNodeClick(e: { node: { id: string } }) {
  selectedSpanId.value = e.node.id;
  if (overview.value?.traceId) {
    void loadDetail(overview.value.traceId, e.node.id);
  }
}

function onEdgeClick(e: { edge: { id: string } }) {
  const id = e.edge.id.replace(/^ret-|^req-/, '');
  selectedSpanId.value = id;
}

function parseJson(v?: string | null): unknown {
  if (!v) return null;
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
}

function detailBlock(label: string, json?: string | null): TraceDetailLike['input'] | null {
  const d = parseJson(json) as TraceDetailLike['input'] | null;
  return d;
}

function summaryText(): string {
  const o = overview.value;
  if (!o) return '';
  const s = parseJson(o.summaryJson) as Record<string, unknown> | null;
  const parts: string[] = [];
  if (s?.agentName) parts.push(`Agent: ${s.agentName}`);
  if (s?.skillStatus && s.skillStatus !== 'not_matched') parts.push(`Skill: ${s.skillStatus}`);
  if (typeof s?.knowledgeHitCount === 'number') parts.push(`知识命中: ${s.knowledgeHitCount}`);
  if (typeof s?.toolCallCount === 'number') parts.push(`工具调用: ${s.toolCallCount}`);
  return parts.join(' · ');
}
</script>

<template>
  <AntModal
    :open="open"
    :width="1200"
    :footer="null"
    :destroy-on-close="true"
    title="智能体路径"
    @cancel="emit('close')"
    @after-open="onOpened"
  >
    <div v-if="loading" class="trace-state">正在加载执行路径…</div>
    <div v-else-if="error" class="trace-state error">加载失败：{{ error }}</div>
    <div v-else-if="!overview" class="trace-state">无执行路径记录</div>
    <template v-else>
      <div class="trace-header">
        <span class="trace-title">执行路径</span>
        <span class="trace-meta">
          <AntTag :color="overview.runStatus === 'completed' ? 'green' : overview.runStatus === 'failed' ? 'red' : 'orange'">
            {{ overview.runStatus ?? '-' }}
          </AntTag>
          <AntTag>{{ overview.integrity }}</AntTag>
          <span v-if="overview.durationMs != null">{{ overview.durationMs }}ms</span>
          <span v-if="summaryText()" class="trace-summary">{{ summaryText() }}</span>
        </span>
      </div>

      <div v-if="overview.integrity === 'missing'" class="trace-state">该消息没有记录智能体路径（旧消息）</div>
      <div v-else class="trace-body">
        <div class="flow-pane">
          <VueFlow
            :nodes="flowNodes"
            :edges="flowEdges"
            :nodes-draggable="false"
            :nodes-connectable="false"
            :edges-updatable="false"
            :elements-selectable="true"
            @node-click="onNodeClick"
            @edge-click="onEdgeClick"
          />
          <a-button v-if="overview.hasMore" size="small" class="load-more" @click="loadMore">
            加载更多步骤（{{ overview.spans.length }}）
          </a-button>
        </div>
        <div class="detail-pane">
          <template v-if="selectedSpan">
            <h4>{{ selectedSpan.label }}</h4>
            <p class="detail-line">spanId: {{ selectedSpan.spanId }}</p>
            <p class="detail-line">
              状态: {{ statusText(selectedSpan.executionStatus, selectedSpan.resultKind ?? null) }}
            </p>
            <p class="detail-line">
              耗时: {{ selectedSpan.durationMs != null ? `${selectedSpan.durationMs}ms` : '未返回' }}
            </p>
            <p v-if="selectedSpan.callKey" class="detail-line">callKey: {{ selectedSpan.callKey }}</p>
            <p v-if="selectedSpan.childTraceId" class="detail-line">childTraceId: {{ selectedSpan.childTraceId }}</p>

            <template v-if="loadingDetail"><p class="detail-empty">加载详情…</p></template>
            <template v-else-if="selectedDetail">
              <div v-if="detailBlock('input', selectedDetail.inputJson)" class="detail-block">
                <b>输入</b>
                <pre>{{ JSON.stringify(detailBlock('input', selectedDetail.inputJson), null, 2) }}</pre>
              </div>
              <div v-if="detailBlock('output', selectedDetail.outputJson)" class="detail-block">
                <b>输出</b>
                <pre>{{ JSON.stringify(detailBlock('output', selectedDetail.outputJson), null, 2) }}</pre>
              </div>
              <div v-if="detailBlock('error', selectedDetail.errorJson)" class="detail-block error">
                <b>错误</b>
                <pre>{{ JSON.stringify(detailBlock('error', selectedDetail.errorJson), null, 2) }}</pre>
              </div>
              <div v-if="detailBlock('config', selectedDetail.configSnapshotJson)" class="detail-block">
                <b>执行时配置</b>
                <pre>{{ JSON.stringify(detailBlock('config', selectedDetail.configSnapshotJson), null, 2) }}</pre>
              </div>
            </template>
            <p v-else class="detail-empty">该步骤无按需详情（或未记录）</p>
          </template>
          <p v-else class="detail-empty">点击左侧节点或箭头查看执行详情</p>
        </div>
      </div>
    </template>
  </AntModal>
</template>

<style scoped>
.trace-state { padding: 40px; text-align: center; color: #999; }
.trace-state.error { color: #cf1322; }
.trace-header { display: flex; justify-content: space-between; align-items: center; padding-bottom: 8px; }
.trace-title { font-weight: 600; }
.trace-meta { display: flex; align-items: center; gap: 8px; }
.trace-summary { color: #666; font-size: 12px; }
.trace-body { display: flex; height: 60vh; border-top: 1px solid #f0f0f0; }
.flow-pane { flex: 1; position: relative; }
.load-more { position: absolute; bottom: 8px; left: 8px; z-index: 10; }
.detail-pane { width: 340px; border-left: 1px solid #f0f0f0; padding: 12px; overflow: auto; background: #fafafa; }
.detail-line { margin-bottom: 4px; font-size: 12px; }
.detail-block { margin-top: 8px; }
.detail-block pre { background: #fff; padding: 6px; font-size: 12px; white-space: pre-wrap; max-height: 200px; overflow: auto; }
.detail-block.error pre { background: #fff1f0; }
.detail-empty { color: #999; font-size: 12px; }
.span-node { font-size: 12px; }
</style>