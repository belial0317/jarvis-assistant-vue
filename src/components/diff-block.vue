<script lang="ts" setup>
import { createIconifyIcon } from '../providers/icons';

import { computed, reactive } from 'vue';

import type { DiffAction, DiffPatch } from '../types';

defineOptions({ name: 'AiDiffBlock' });

const props = defineProps<{
  /** Diff 补丁数据 */
  patch: DiffPatch;
  /** 是否只读（已接受/拒绝后不可操作） */
  readonly?: boolean;
}>();

const emit = defineEmits<{
  /** 审批动作（整体或按行） */
  action: [payload: { patchId: string; action: DiffAction; lineIndex?: number }];
}>();

const CheckIcon = createIconifyIcon('lucide:check');
const XIcon = createIconifyIcon('lucide:x');
const FileIcon = createIconifyIcon('lucide:file-code');
const LoaderIcon = createIconifyIcon('lucide:loader');
const AlertIcon = createIconifyIcon('lucide:alert-circle');

// 本地按行决策状态（与 patch.lineDecisions 同步）
const lineDecisions = reactive<Record<number, boolean>>({
  ...(props.patch.lineDecisions ?? {}),
});

const status = computed(() => props.patch.status);
const isPending = computed(() => status.value === 'pending');
const isPartial = computed(() => status.value === 'partial');
const isDecided = computed(
  () => status.value === 'accepted' || status.value === 'rejected',
);

// 可操作的行（仅 add/delete 行可按行接受，context 行不可操作）
const actionableLines = computed(() =>
  props.patch.lines.filter((l) => l.type !== 'context'),
);

// 已决策行数（用于 partial 状态展示）
const decidedCount = computed(() => Object.keys(lineDecisions).length);
const totalCount = computed(() => actionableLines.value.length);
const acceptedCount = computed(
  () => Object.values(lineDecisions).filter(Boolean).length,
);

// 行显示状态：'accepted' | 'rejected' | 'undecided'
function lineState(index: number): 'accepted' | 'rejected' | 'undecided' {
  if (!(index in lineDecisions)) return 'undecided';
  return lineDecisions[index] ? 'accepted' : 'rejected';
}

// 整体接受
function acceptAll() {
  for (const line of actionableLines.value) {
    lineDecisions[line.index] = true;
  }
  emit('action', { patchId: props.patch.id, action: 'accept' });
}

// 整体拒绝
function rejectAll() {
  for (const line of actionableLines.value) {
    lineDecisions[line.index] = false;
  }
  emit('action', { patchId: props.patch.id, action: 'reject' });
}

// 按行接受
function acceptLine(index: number) {
  lineDecisions[index] = true;
  emit('action', { patchId: props.patch.id, action: 'accept_line', lineIndex: index });
}

// 按行拒绝
function rejectLine(index: number) {
  lineDecisions[index] = false;
  emit('action', { patchId: props.patch.id, action: 'reject_line', lineIndex: index });
}

// 状态徽章文本
const statusBadge = computed(() => {
  switch (status.value) {
    case 'accepted': {
      return { text: '已接受', class: 'bg-emerald-500/15 text-emerald-600' };
    }
    case 'rejected': {
      return { text: '已拒绝', class: 'bg-red-500/15 text-red-600' };
    }
    case 'partial': {
      return {
        text: `部分接受 ${acceptedCount.value}/${totalCount.value}`,
        class: 'bg-amber-500/15 text-amber-600',
      };
    }
    default: {
      return { text: '待审批', class: 'bg-muted text-muted-foreground' };
    }
  }
});
</script>

<template>
  <div
    class="overflow-hidden rounded-lg border border-border bg-card text-[12px]"
    :class="{
      'border-emerald-500/40': status === 'accepted',
      'border-red-500/40': status === 'rejected',
      'border-amber-500/40': status === 'partial',
    }"
  >
    <!-- 头部：文件路径 + 统计 + 状态 -->
    <div
      class="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-2"
    >
      <component :is="FileIcon" class="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
      <span class="min-w-0 flex-1 truncate font-medium" :title="patch.filePath">
        {{ patch.filePath }}
      </span>
      <span class="flex-shrink-0 font-mono text-[11px]">
        <span class="text-emerald-600">+{{ patch.stats.additions }}</span>
        <span class="ml-1.5 text-red-600">-{{ patch.stats.deletions }}</span>
      </span>
      <span
        class="flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium"
        :class="statusBadge.class"
      >
        {{ statusBadge.text }}
      </span>
    </div>

    <!-- 错误提示 -->
    <div
      v-if="patch.error"
      class="flex items-center gap-1.5 border-b border-red-500/30 bg-red-500/5 px-3 py-1.5 text-[11px] text-red-600"
    >
      <component :is="AlertIcon" class="h-3 w-3 flex-shrink-0" />
      <span>{{ patch.error }}</span>
    </div>

    <!-- Diff 内容（行级渲染） -->
    <div class="overflow-x-auto font-mono">
      <table class="w-full border-collapse">
        <tbody>
          <tr
            v-for="line in patch.lines"
            :key="line.index"
            class="border-b border-border/50 last:border-0"
            :class="{
              'bg-emerald-500/8': line.type === 'add' && lineState(line.index) !== 'rejected',
              'bg-red-500/8': line.type === 'delete' && lineState(line.index) !== 'accepted',
              'bg-muted/20': line.type === 'context',
              'opacity-50': (lineState(line.index) === 'rejected' && line.type === 'add') || (lineState(line.index) === 'accepted' && line.type === 'delete'),
            }"
          >
            <!-- 行号 -->
            <td class="w-[44px] select-none px-2 text-right align-top text-[10px] text-muted-foreground/60">
              <span v-if="line.oldLineNumber">{{ line.oldLineNumber }}</span>
            </td>
            <td class="w-[44px] select-none px-2 text-right align-top text-[10px] text-muted-foreground/60">
              <span v-if="line.newLineNumber">{{ line.newLineNumber }}</span>
            </td>
            <!-- 行类型标记 -->
            <td class="w-[20px] select-none px-1 text-center align-top">
              <span
                v-if="line.type === 'add'"
                class="text-emerald-600"
              >+</span>
              <span
                v-else-if="line.type === 'delete'"
                class="text-red-600"
              >-</span>
              <span v-else class="text-muted-foreground/40"> </span>
            </td>
            <!-- 行内容 -->
            <td class="whitespace-pre px-2 align-top">
              <span>{{ line.content || ' ' }}</span>
            </td>
            <!-- 按行操作按钮（仅 pending/partial 状态 + add/delete 行） -->
            <td
              v-if="!readonly && (isPending || isPartial) && line.type !== 'context'"
              class="w-[60px] select-none px-1 align-top"
            >
              <div class="flex items-center gap-0.5 opacity-0 transition-opacity hover:opacity-100 group-hover:opacity-100">
                <button
                  type="button"
                  class="flex h-4 w-4 items-center justify-center rounded text-emerald-600 hover:bg-emerald-500/15"
                  :class="lineState(line.index) === 'accepted' ? 'bg-emerald-500/15 opacity-100' : ''"
                  title="接受此行"
                  @click="acceptLine(line.index)"
                >
                  <component :is="CheckIcon" class="h-3 w-3" />
                </button>
                <button
                  type="button"
                  class="flex h-4 w-4 items-center justify-center rounded text-red-600 hover:bg-red-500/15"
                  :class="lineState(line.index) === 'rejected' ? 'bg-red-500/15 opacity-100' : ''"
                  title="拒绝此行"
                  @click="rejectLine(line.index)"
                >
                  <component :is="XIcon" class="h-3 w-3" />
                </button>
              </div>
            </td>
            <td
              v-else-if="line.type !== 'context' && isDecided"
              class="w-[60px] select-none px-1 align-top"
            >
              <component
                :is="lineState(line.index) === 'accepted' ? CheckIcon : XIcon"
                class="h-3 w-3"
                :class="lineState(line.index) === 'accepted' ? 'text-emerald-600' : 'text-red-600'"
              />
            </td>
            <td v-else class="w-[60px]"></td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 底部操作栏（仅 pending/partial 状态显示） -->
    <div
      v-if="!readonly && (isPending || isPartial)"
      class="flex items-center justify-between border-t border-border bg-muted/30 px-3 py-2"
    >
      <span class="text-[11px] text-muted-foreground">
        <template v-if="isPartial">
          已决策 {{ decidedCount }}/{{ totalCount }} 行
        </template>
        <template v-else>
          共 {{ totalCount }} 处变更
        </template>
      </span>
      <div class="flex items-center gap-1.5">
        <button
          type="button"
          class="flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          @click="rejectAll"
        >
          <component :is="XIcon" class="h-3 w-3" />
          全部拒绝
        </button>
        <button
          type="button"
          class="flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1 text-[11px] font-medium text-white transition-colors hover:bg-emerald-700"
          @click="acceptAll"
        >
          <component :is="CheckIcon" class="h-3 w-3" />
          全部接受
        </button>
      </div>
    </div>

    <!-- 应用中状态 -->
    <div
      v-if="status === 'accepted' && patch.error === undefined && readonly"
      class="flex items-center gap-1.5 border-t border-emerald-500/30 bg-emerald-500/5 px-3 py-1.5 text-[11px] text-emerald-600"
    >
      <component :is="LoaderIcon" class="h-3 w-3 animate-spin" />
      <span>正在应用修改...</span>
    </div>
  </div>
</template>