<script lang="ts" setup>
import { createIconifyIcon } from '../providers/icons';
import { message } from 'ant-design-vue';

import { computed, onMounted, ref } from 'vue';

import type { InstalledPlugin, MarketPlugin, SchemaPage } from '../api/market';
import {
  deleteMcpServer,
  fetchMarketCatalog,
  installMarketPlugin,
  listInstalledPlugins,
  toggleMcpServerEnabled,
} from '../api/market';
import SchemaPageRenderer from './schema-page-renderer.vue';

defineOptions({ name: 'AiMarket' });

const SearchIcon = createIconifyIcon('lucide:search');
const StarIcon = createIconifyIcon('lucide:star');
const RefreshIcon = createIconifyIcon('lucide:refresh-cw');

// ===== 状态 =====
const tab = ref<'discover' | 'installed'>('discover');
const loading = ref(false);
/** 门户目录：null = 不可达/未配置（降级态） */
const catalog = ref<MarketPlugin[] | null>(null);
const installed = ref<InstalledPlugin[]>([]);
/** UI 插件页面（schema-page）当前打开的插件 */
const pagePlugin = ref<InstalledPlugin | null>(null);
const keyword = ref('');
const category = ref('全部');
const detailPlugin = ref<MarketPlugin | null>(null);

function findInstalled(plugin: MarketPlugin): InstalledPlugin | undefined {
  return installed.value.find((s) => s.pluginCode === plugin.pluginCode);
}
function catalogPluginOf(inst: InstalledPlugin): MarketPlugin | undefined {
  return catalog.value?.find((p) => p.pluginCode === inst.pluginCode);
}

const categories = computed(() => {
  if (!catalog.value) return ['全部'];
  const set = new Set(catalog.value.map((p) => p.category));
  return ['全部', ...set];
});

const filteredCatalog = computed(() => {
  const kw = keyword.value.trim().toLowerCase();
  return (catalog.value ?? []).filter((p) => {
    if (category.value !== '全部' && p.category !== category.value) return false;
    if (!kw) return true;
    return (
      p.name.toLowerCase().includes(kw) ||
      p.tools.some((t) => t.name.toLowerCase().includes(kw))
    );
  });
});

async function loadAll() {
  loading.value = true;
  try {
    const [cat, inst] = await Promise.all([
      fetchMarketCatalog(),
      listInstalledPlugins().catch(() => [] as InstalledPlugin[]),
    ]);
    catalog.value = cat;
    installed.value = inst;
  } finally {
    loading.value = false;
  }
}
onMounted(loadAll);

// ===== 安装流（3 步：注册 → 连通测试 → 工具清单确认） =====
const installDialog = ref(false);
const installTarget = ref<MarketPlugin | null>(null);
const installStep = ref(-1); // -1 确认页 / 0..2 执行中 / 3 完成
const installError = ref('');

function openInstall(plugin: MarketPlugin) {
  installTarget.value = plugin;
  installStep.value = -1;
  installError.value = '';
  installDialog.value = true;
}

async function runInstall() {
  const plugin = installTarget.value;
  if (!plugin) return;
  installError.value = '';
  try {
    const { toolCount } = await installMarketPlugin(plugin, (step) => {
      installStep.value = step;
    });
    await loadAll();
    installStep.value = 3;
    message.success(`安装成功：AI 已可调用 ${toolCount} 个新工具`);
  } catch (error) {
    installError.value = error instanceof Error ? error.message : '安装失败';
    message.error(`安装失败：${installError.value}`);
  }
}

function closeInstall() {
  installDialog.value = false;
  detailPlugin.value = null;
}

// ===== 已安装管理 =====
async function toggle(inst: InstalledPlugin, enabled: boolean) {
  if (!inst.serverId) return;
  await toggleMcpServerEnabled(inst.serverId, enabled);
  message.success(enabled ? '已启用（AI 可调用其工具）' : '已停用（AI 不再调用）');
  await loadAll();
}

async function uninstall(inst: InstalledPlugin) {
  if (!inst.serverId) return;
  await deleteMcpServer(inst.serverId);
  message.success('已卸载（仅移除本系统注册，目录与统计不受影响）');
  await loadAll();
}

/** 打开 UI 插件页面（schema-page）。工具白名单 = 本插件目录工具清单 */
function openPage(inst: InstalledPlugin) {
  pagePlugin.value = inst;
}
function pageToolWhitelist(inst: InstalledPlugin): string[] {
  return catalogPluginOf(inst)?.tools.map((t) => t.name) ?? [];
}

function statusText(inst: InstalledPlugin): string {
  if (inst.enabled === false) return '已停用';
  return inst.status === 'connected' ? '已连接' : inst.status === 'error' ? '异常' : '检测中';
}
function statusClass(inst: InstalledPlugin): string {
  if (inst.enabled === false) return 'text-amber-600';
  return inst.status === 'connected'
    ? 'text-emerald-600'
    : inst.status === 'error'
      ? 'text-red-500'
      : 'text-amber-600';
}
</script>

<template>
  <div class="flex h-full flex-col">
    <div
      class="flex h-[38px] flex-shrink-0 items-center border-b border-border bg-background px-3"
    >
      <span class="text-[13px] font-medium">插件市场</span>
      <span class="ml-auto flex items-center gap-2 text-[11px] text-muted-foreground">
        <span>已安装 {{ installed.length }}</span>
        <button class="hover:text-foreground" title="刷新" @click="loadAll()">
          <component :is="RefreshIcon" class="h-3.5 w-3.5" :class="loading ? 'animate-spin' : ''" />
        </button>
      </span>
    </div>

    <div class="min-h-0 flex-1 overflow-auto p-3">
      <!-- 门户不可达降级态（P2） -->
      <div
        v-if="catalog === null && !loading"
        class="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[12px] text-amber-700 dark:text-amber-400"
      >
        门户目录服务不可达或未配置，当前仅显示已安装插件
      </div>

      <!-- Tabs -->
      <div class="mb-3 flex gap-4 border-b border-border">
        <button
          class="border-b-2 pb-1.5 text-[13px]"
          :class="tab === 'discover' ? 'border-primary font-medium text-primary' : 'border-transparent text-muted-foreground'"
          @click="tab = 'discover'"
        >
          发现
        </button>
        <button
          class="border-b-2 pb-1.5 text-[13px]"
          :class="tab === 'installed' ? 'border-primary font-medium text-primary' : 'border-transparent text-muted-foreground'"
          @click="tab = 'installed'"
        >
          已安装 {{ installed.length }}
        </button>
      </div>

      <!-- 发现页 -->
      <div v-if="tab === 'discover'">
        <div class="mb-3 flex items-center gap-1.5">
          <div class="flex h-7 flex-1 items-center gap-1.5 rounded-md border border-border px-2">
            <component :is="SearchIcon" class="h-3.5 w-3.5 text-muted-foreground" />
            <input
              v-model="keyword"
              type="text"
              class="h-full flex-1 bg-transparent text-[12px] outline-none"
              placeholder="搜索插件 / 工具名…"
            />
          </div>
        </div>
        <div class="mb-3 flex flex-wrap gap-2">
          <button
            v-for="c in categories"
            :key="c"
            class="rounded-full px-2.5 py-0.5 text-[11px]"
            :class="category === c ? 'bg-primary text-primary-foreground' : 'bg-muted/50 text-muted-foreground hover:bg-muted'"
            @click="category = c"
          >
            {{ c }}
          </button>
        </div>

        <div v-if="loading" class="py-10 text-center text-[12px] text-muted-foreground">加载中…</div>
        <div v-else-if="filteredCatalog.length === 0" class="py-10 text-center text-[12px] text-muted-foreground">
          {{ catalog === null ? '目录不可用' : '没有匹配的插件' }}
        </div>

        <div
          v-for="p in filteredCatalog"
          :key="p.pluginCode"
          class="mb-2.5 flex gap-2.5 rounded-lg border border-border bg-card p-3"
        >
          <div class="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10 text-[18px]">
            {{ p.icon ?? '🧩' }}
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-1.5 text-[13px] font-medium">
              {{ p.name }}
              <span v-if="findInstalled(p)" class="text-[10px] text-emerald-600">● 已安装</span>
            </div>
            <div class="mt-0.5 line-clamp-2 text-[12px] leading-relaxed text-muted-foreground">
              {{ p.description }}
            </div>
            <div class="mt-1 flex items-center gap-2.5 text-[11px] text-muted-foreground">
              <span class="flex items-center gap-0.5">
                <component :is="StarIcon" class="h-3 w-3" />{{ p.rating ?? '-' }}
              </span>
              <span>v{{ p.version }}</span>
              <span>{{ p.provider }}</span>
              <span>{{ p.tools.length }} 工具</span>
            </div>
          </div>
          <div class="flex flex-shrink-0 flex-col justify-center">
            <button
              class="h-7 rounded-md px-3 text-[11px]"
              :class="findInstalled(p) ? 'border border-border text-muted-foreground hover:bg-accent' : 'bg-primary text-primary-foreground hover:bg-primary/90'"
              @click="detailPlugin = p"
            >
              {{ findInstalled(p) ? '详情' : '安装' }}
            </button>
          </div>
        </div>
      </div>

      <!-- 已安装页 -->
      <div v-if="tab === 'installed'">
        <div v-if="installed.length === 0" class="py-10 text-center text-[12px] text-muted-foreground">
          暂无已安装插件，去「发现」页逛逛
        </div>
        <div
          v-for="s in installed"
          :key="s.serverId"
          class="mb-2.5 flex gap-2.5 rounded-lg border border-border bg-card p-3"
        >
          <div class="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10 text-[18px]">
            {{ s.icon ?? '🧩' }}
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-1.5 text-[13px] font-medium">
              {{ s.name ?? s.pluginCode }}
              <span :class="statusClass(s)" class="text-[10px]">● {{ statusText(s) }}</span>
              <span v-if="s.ui" class="rounded bg-primary/10 px-1 text-[10px] text-primary">UI 插件</span>
            </div>
            <div class="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
              <span v-if="s.status === 'error' && s.lastError" class="text-red-500">{{ s.lastError }}</span>
              <span v-else>{{ s.description }}</span>
            </div>
            <div class="mt-1 flex items-center gap-2.5 text-[11px] text-muted-foreground">
              <span>启用</span>
              <button
                class="relative h-4 w-7 rounded-full transition-colors"
                :class="s.enabled !== false ? 'bg-primary' : 'bg-muted'"
                @click="toggle(s, s.enabled === false)"
              >
                <span
                  class="absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform"
                  :class="s.enabled !== false ? 'left-[14px]' : 'left-0.5'"
                />
              </button>
            </div>
          </div>
          <div class="flex flex-shrink-0 flex-col justify-center gap-1.5">
            <button
              v-if="s.ui?.type === 'schema-page'"
              class="h-7 rounded-md bg-primary px-2.5 text-[11px] text-primary-foreground hover:bg-primary/90"
              @click="openPage(s)"
            >
              打开页面
            </button>
            <button
              class="h-7 rounded-md border border-red-500/30 bg-red-500/5 px-2.5 text-[11px] text-red-500 hover:bg-red-500/10"
              @click="uninstall(s)"
            >
              卸载
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 插件详情层 -->
    <div v-if="detailPlugin" class="absolute inset-0 z-10 flex flex-col overflow-auto bg-background p-3">
      <button
        class="mb-2 self-start rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent"
        @click="detailPlugin = null"
      >
        ← 返回
      </button>
      <h3 class="flex items-center gap-2 text-[15px] font-semibold">
        {{ detailPlugin.icon ?? '🧩' }} {{ detailPlugin.name }}
      </h3>
      <div class="mt-1 text-[11px] text-muted-foreground">
        v{{ detailPlugin.version }} · {{ detailPlugin.provider }}
      </div>
      <div class="mt-3 text-[12px] leading-relaxed">{{ detailPlugin.description }}</div>

      <div class="mt-4 text-[12px] font-medium text-muted-foreground">工具清单（安装后 AI 可调用）</div>
      <div
        v-for="t in detailPlugin.tools"
        :key="t.name"
        class="mt-1.5 rounded-md border border-border p-2 text-[12px]"
      >
        <b class="font-mono text-primary">{{ t.name }}</b>
        <div class="mt-0.5 text-muted-foreground">{{ t.description }}</div>
      </div>

      <div v-if="detailPlugin.authNote" class="mt-4">
        <div class="text-[12px] font-medium text-muted-foreground">鉴权要求</div>
        <div class="mt-1 text-[12px]">{{ detailPlugin.authNote }}</div>
      </div>

      <div v-if="detailPlugin.updates?.length" class="mt-4">
        <div class="text-[12px] font-medium text-muted-foreground">版本记录</div>
        <div v-for="u in detailPlugin.updates" :key="u.version" class="flex gap-2 border-b border-dashed border-border py-1.5 text-[12px]">
          <span class="w-12 font-mono text-primary">{{ u.version }}</span>
          <span class="text-muted-foreground">{{ u.note }}</span>
        </div>
      </div>

      <button
        v-if="!findInstalled(detailPlugin)"
        class="mt-5 h-8 rounded-md bg-primary text-[12px] text-primary-foreground hover:bg-primary/90"
        @click="openInstall(detailPlugin)"
      >
        安装
      </button>
    </div>

    <!-- UI 插件页面（schema-page 渲染器） -->
    <div v-if="pagePlugin?.ui?.type === 'schema-page'" class="absolute inset-0 z-10 flex flex-col bg-background">
      <div class="flex h-[38px] flex-shrink-0 items-center gap-2 border-b border-border px-3">
        <span class="text-[13px] font-medium">{{ pagePlugin.name ?? pagePlugin.pluginCode }}</span>
        <span class="text-[10px] text-muted-foreground">UI 插件 · 声明式页面</span>
        <button
          class="ml-auto h-6 rounded-md border border-border px-2 text-[11px] text-muted-foreground hover:bg-accent"
          @click="pagePlugin = null"
        >
          关闭
        </button>
      </div>
      <div class="min-h-0 flex-1 p-3">
        <SchemaPageRenderer
          :key="pagePlugin.serverId"
          :page="(pagePlugin.ui!.page as SchemaPage)"
          :server-id="pagePlugin.serverId"
          :tool-whitelist="pageToolWhitelist(pagePlugin)"
        />
      </div>
    </div>

    <!-- 安装确认 / 进度弹层 -->
    <div v-if="installDialog" class="absolute inset-0 z-20 flex items-center justify-center bg-black/35 p-4">
      <div class="w-full max-w-[360px] rounded-xl bg-background p-4">
        <h4 class="text-[13px] font-semibold">安装「{{ installTarget?.name }}」？</h4>
        <div class="mt-2 text-[12px] leading-relaxed text-muted-foreground">
          <div>· 鉴权：{{ installTarget?.authNote ?? '无需鉴权' }}</div>
          <div>· 将注册到当前租户（租户隔离生效）</div>
          <div>· 安装后会话即可调用 {{ installTarget?.tools.length }} 个新工具</div>
        </div>

        <div v-if="installStep >= 0" class="mt-3 space-y-1.5">
          <div
            v-for="(label, i) in ['注册插件', '连通测试', '拉取工具清单']"
            :key="label"
            class="flex items-center gap-2 text-[12px]"
          >
            <span
              class="flex h-4 w-4 items-center justify-center rounded-full text-[10px] text-white"
              :class="installStep > i || installStep === 3 ? 'bg-emerald-500' : installStep === i ? 'animate-pulse bg-primary' : 'bg-muted-foreground/30'"
            >
              {{ installStep > i || installStep === 3 ? '✓' : '' }}
            </span>
            <span :class="installStep === i ? 'font-medium' : 'text-muted-foreground'">{{ label }}</span>
          </div>
          <div v-if="installError" class="text-[12px] text-red-500">{{ installError }}</div>
        </div>

        <div class="mt-4 flex justify-end gap-2">
          <button
            class="h-7 rounded-md border border-border px-3 text-[12px] text-muted-foreground hover:bg-accent"
            @click="closeInstall"
          >
            {{ installStep === 3 ? '完成' : '取消' }}
          </button>
          <button
            v-if="installStep < 0"
            class="h-7 rounded-md bg-primary px-3 text-[12px] text-primary-foreground hover:bg-primary/90"
            @click="runInstall()"
          >
            安装
          </button>
          <button
            v-else-if="installError"
            class="h-7 rounded-md bg-primary px-3 text-[12px] text-primary-foreground hover:bg-primary/90"
            @click="runInstall()"
          >
            重试
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
