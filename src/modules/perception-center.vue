<script lang="ts" setup>
/**
 * 感知中心：页面感知配置 + 感知优化合并入口（2026-09-04 用户决策）。
 * 内部以页签组织：「页面配置」（规则 CRUD + 当前页画像）/「优化闭环」（目标/草稿/QA/指标）。
 * 页签用 v-if 切换，面板自持数据加载，切回即刷新。
 */
import { ref } from 'vue';

import PerceptionCompact from './perception-compact.vue';
import PerceptionOptimize from './perception-optimize.vue';

defineOptions({ name: 'AiPerceptionCenter' });

type CenterTab = 'config' | 'optimize';

const TABS: Array<{ key: CenterTab; label: string }> = [
  { key: 'config', label: '页面配置' },
  { key: 'optimize', label: '优化闭环' },
];

const activeTab = ref<CenterTab>('config');
</script>

<template>
  <div class="flex h-full flex-col">
    <!-- 页签栏 -->
    <div class="flex flex-shrink-0 items-center gap-1 border-b border-border px-3 py-1.5">
      <button
        v-for="t in TABS"
        :key="t.key"
        type="button"
        class="rounded-md px-3 py-1 text-xs transition"
        :class="
          activeTab === t.key
            ? 'bg-primary/10 font-medium text-primary'
            : 'text-muted-foreground hover:bg-accent hover:text-foreground'
        "
        @click="activeTab = t.key"
      >
        {{ t.label }}
      </button>
    </div>
    <div class="min-h-0 flex-1">
      <PerceptionCompact v-if="activeTab === 'config'" />
      <PerceptionOptimize v-else />
    </div>
  </div>
</template>
