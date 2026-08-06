<script lang="ts" setup>
/**
 * NL2SQL 审计日志组件（T3.8）
 *
 * 功能：
 * - 展示 NL2SQL 操作审计日志（问题、SQL、复杂度、耗时、成功/失败）
 * - 用户反馈（positive/negative）驱动 T3.1 自学习闭环
 * - 仅展示最近 50 条，不支持完整管理（符合 AI 助手模块约束）
 */
import { createIconifyIcon } from '../providers/icons';
import { Empty, message, Spin, Tag } from 'ant-design-vue';

import { onMounted, ref } from 'vue';

import type { Nl2sqlAuditVO } from '../api/nl2sql';

import { listAudits, submitFeedback } from '../api/nl2sql';
import { useBackendHealth } from '../composables/use-backend-health';

defineOptions({ name: 'AiNl2sqlAudit' });

const RefreshIcon = createIconifyIcon('lucide:refresh-cw');
const ThumbsUpIcon = createIconifyIcon('lucide:thumbs-up');
const ThumbsDownIcon = createIconifyIcon('lucide:thumbs-down');

const audits = ref<Nl2sqlAuditVO[]>([]);

const health = useBackendHealth();
const loading = ref(false);
const feedbackLoading = ref<string>('');

async function loadAudits() {
  loading.value = true;
  try {
    audits.value = await listAudits(50);
  } catch {
    audits.value = [];
  } finally {
    loading.value = false;
  }
}

async function handleFeedback(id: string, feedback: 'negative' | 'positive') {
  feedbackLoading.value = id;
  try {
    await submitFeedback(id, feedback);
    message.success(feedback === 'positive' ? '已记录正面反馈' : '已记录负面反馈');
    // 更新本地状态，避免完整刷新
    const item = audits.value.find((a) => a.id === id);
    if (item) {
      item.userFeedback = feedback;
    }
  } catch {
    message.error('反馈提交失败');
  } finally {
    feedbackLoading.value = '';
  }
}

function truncate(text: string | undefined, max: number): string {
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function complexityColor(complexity: string): string {
  switch (complexity) {
    case 'simple': {
      return 'green';
    }
    case 'medium': {
      return 'blue';
    }
    case 'complex': {
      return 'orange';
    }
    default: {
      return 'default';
    }
  }
}

function complexityText(complexity: string): string {
  switch (complexity) {
    case 'simple': {
      return '简单';
    }
    case 'medium': {
      return '中等';
    }
    case 'complex': {
      return '复杂';
    }
    default: {
      return '未知';
    }
  }
}

onMounted(() => {
  if (health.value.state === 'disconnected') return;
  loadAudits();
});
</script>

<template>
  <!-- 离线占位：整页替换 -->
  <div
    v-if="health.state === 'disconnected'"
    class="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-[12px] text-muted-foreground"
  >
    <div class="text-2xl">⚠</div>
    <div>后端未连接，无法加载 NL2SQL 审计</div>
    <div class="text-[11px] opacity-70">请在设置 → 后端服务 配置服务地址</div>
  </div>
  <div v-else class="flex h-full flex-col">
    <!-- 头部 -->
    <div
      class="flex h-[38px] flex-shrink-0 items-center justify-between border-b border-border bg-background px-3"
    >
      <span class="text-[13px] font-medium">NL2SQL 审计日志</span>
      <button
        class="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
        :disabled="loading"
        @click="loadAudits"
      >
        <component :is="RefreshIcon" class="h-3 w-3" :class="{ 'animate-spin': loading }" />
        刷新
      </button>
    </div>

    <!-- 内容区 -->
    <div class="min-h-0 flex-1 overflow-auto p-3">
      <Spin :spinning="loading">
        <Empty
          v-if="audits.length === 0 && !loading"
          description="暂无审计记录"
          :image="Empty.PRESENTED_IMAGE_SIMPLE"
        />

        <!-- 审计日志列表 -->
        <div v-else class="space-y-2">
          <div
            v-for="item in audits"
            :key="item.id"
            class="rounded-lg border border-border bg-card p-3"
          >
            <!-- 问题 -->
            <div class="mb-1.5 flex items-start gap-2">
              <span class="text-[11px] mt-0.5 flex-shrink-0 text-muted-foreground">Q</span>
              <span class="text-[12px] leading-relaxed">{{ item.question }}</span>
            </div>

            <!-- SQL（截断展示） -->
            <div v-if="item.sqlText" class="mb-2 rounded bg-muted/50 px-2 py-1">
              <code class="text-[11px] text-muted-foreground break-all">
                {{ truncate(item.sqlText, 120) }}
              </code>
            </div>

            <!-- 元数据标签行 -->
            <div class="flex flex-wrap items-center gap-1.5">
              <Tag v-if="item.complexity" :color="complexityColor(item.complexity)" class="!m-0 !text-[10px]">
                {{ complexityText(item.complexity) }}
              </Tag>
              <Tag :color="item.executeSuccess ? 'green' : 'red'" class="!m-0 !text-[10px]">
                {{ item.executeSuccess ? '成功' : '失败' }}
              </Tag>
              <span v-if="item.rowCount !== undefined" class="text-[10px] text-muted-foreground">
                {{ item.rowCount }} 行
              </span>
              <span v-if="item.elapsedMs !== undefined" class="text-[10px] text-muted-foreground">
                {{ item.elapsedMs }}ms
              </span>
              <span v-if="item.retryCount > 0" class="text-[10px] text-amber-500">
                重试 {{ item.retryCount }} 次
              </span>
              <span class="ml-auto text-[10px] text-muted-foreground">
                {{ item.createTime || '' }}
              </span>
            </div>

            <!-- 反馈区 -->
            <div class="mt-2 flex items-center gap-2 border-t border-border/50 pt-2">
              <template v-if="item.userFeedback">
                <Tag
                  :color="item.userFeedback === 'positive' ? 'green' : 'red'"
                  class="!m-0 !text-[10px]"
                >
                  <component
                    :is="item.userFeedback === 'positive' ? ThumbsUpIcon : ThumbsDownIcon"
                    class="mr-1 inline h-3 w-3"
                  />
                  {{ item.userFeedback === 'positive' ? '已点赞' : '已点踩' }}
                </Tag>
              </template>
              <template v-else>
                <button
                  class="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-green-600 disabled:opacity-50"
                  :disabled="feedbackLoading === item.id"
                  @click="handleFeedback(item.id, 'positive')"
                >
                  <component :is="ThumbsUpIcon" class="h-3 w-3" />
                  有用
                </button>
                <button
                  class="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-red-500 disabled:opacity-50"
                  :disabled="feedbackLoading === item.id"
                  @click="handleFeedback(item.id, 'negative')"
                >
                  <component :is="ThumbsDownIcon" class="h-3 w-3" />
                  需改进
                </button>
              </template>
            </div>
          </div>
        </div>
      </Spin>
    </div>
  </div>
</template>