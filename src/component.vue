<script lang="ts" setup>
import { createIconifyIcon } from './providers/icons';
import type { AiAssistantConfig } from './providers/config';
import { AI_ASSISTANT_CONFIG_KEY, useAiAssistantConfig } from './providers/inject';
import {
  AI_ASSISTANT_HOST_CONTEXT_KEY,
  createHostBusinessContextStore,
} from './providers/host-context';
import { Drawer as ADrawer, Tooltip as ATooltip } from 'ant-design-vue';

import { computed, onBeforeUnmount, onMounted, provide, ref, watch } from 'vue';

import AiAssistantContent from './content.vue';

import {
  checkBackendHealth,
  useBackendHealth,
} from './composables/use-backend-health';
import { applySyncParams } from './composables/use-settings-sync';
import {
  SDK_UPDATE_KEY,
  checkSdkUpdate,
  dismissSdkNotice,
  getSdkVersion,
  isSdkNoticeDismissed,
  type SdkUpdateInfo,
} from './composables/use-sdk-update';

import { pagePerception } from './perception/manager';

defineOptions({ name: 'AiAssistant' });

/**
 * 抽屉根容器的额外 class
 *
 * 用法：
 *   <AiAssistant root-class-name="ai-theme-light" />
 *
 * 在 CSS 中可以这样覆盖主题：
 *   .ai-theme-light .ant-drawer-content { ... }
 *   .ai-theme-light .bg-background { ... }
 */
const props = withDefaults(
  defineProps<{
    rootClassName?: string;
    /**
     * 主题模式（T6-U2）：
     * - 'auto'（默认）：跟随宿主 html.dark 类（MutationObserver 实时同步）；
     * - 'light' / 'dark'：强制指定，不随宿主。
     */
    theme?: 'auto' | 'dark' | 'light';
    /**
     * 可选的配置对象。
     * 优先级高于 createAiAssistant(config) 注入的全局配置：
     * - prop 提供时，prop 覆盖全局（同一渲染周期内组件局部的 override）
     * - prop 缺省时降级到全局注入的配置（来自 useAiAssistantConfig）
     */
    config?: AiAssistantConfig;
  }>(),
  { rootClassName: '', theme: 'auto' },
);

// 解析有效配置：优先使用 prop 传入的配置，否则使用全局注入的配置
let resolvedConfig: AiAssistantConfig;
if (props.config) {
  resolvedConfig = props.config;
} else {
  try {
    resolvedConfig = useAiAssistantConfig();
  } catch {
    resolvedConfig = {} as AiAssistantConfig;
  }
}
provide(AI_ASSISTANT_CONFIG_KEY, resolvedConfig);

// T18：i18n 语言同步（宿主 locale.getLocale() 变化时切换字典；须在 resolvedConfig 声明后）
watch(
  () => resolvedConfig.locale?.getLocale?.(),
  (l) => {
    if (l) {
      const code = l.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en';
      import('./i18n').then((m) => m.setI18nLocale(code as 'zh-CN' | 'en'));
    }
  },
  { immediate: true },
);

// 宿主/门户下发的参数同步（syncParams）：挂载即应用 + 配置变更时重新应用
// （典型场景：门户异步加载系统参数后更新 :config，此时组件已挂载）
watch(
  () => props.config?.syncParams,
  (sync) => {
    if (sync) {
      applySyncParams(sync);
    }
  },
  { immediate: true },
);

const SparklesIcon = createIconifyIcon('lucide:sparkles');
const XIcon = createIconifyIcon('lucide:x');

const open = ref(false);
const health = useBackendHealth();

// ===== SDK 升级提醒（tasks-2609-1715-49 T4）=====
// 检查时机（用户决策）：首次加载组件 + 每次打开面板各一次；in-flight 去重（T3）。
// 状态经 provide 下发：chat 头部红字 / settings「关于」消费；console 提醒仅输出一次。
const sdkUpdate = ref<SdkUpdateInfo | null>(null);
provide(SDK_UPDATE_KEY, { info: sdkUpdate, dismiss: dismissSdkNotice });

async function runSdkUpdateCheck() {
  const info = await checkSdkUpdate();
  if (info && !sdkUpdate.value) {
    sdkUpdate.value = info;
    console.info(
      `[jarvis-ai-assistant] ${getSdkVersion()} → ${info.latestVersion} 可用：${info.changelogUrl ?? '见变更日志'}`,
    );
  }
}

// ===== T16：抽屉形态（宽度可拖拽 560-960 记忆 / 窄屏全屏） =====
const isNarrow = ref(typeof window !== 'undefined' && window.innerWidth < 768);
const drawerWidthPx = ref(560);
const actualWidth = computed(() => (isNarrow.value ? window.innerWidth : drawerWidthPx.value));
try {
  const saved = Number(localStorage.getItem('ai_assistant_drawer_width'));
  if (saved >= 560 && saved <= 960) {
    drawerWidthPx.value = saved;
  }
} catch {
  // localStorage 不可用：用默认
}
function startResize(e: MouseEvent) {
  e.preventDefault();
  const startX = e.clientX;
  const startW = drawerWidthPx.value;
  function onMove(ev: MouseEvent) {
    drawerWidthPx.value = Math.min(960, Math.max(560, startW + (startX - ev.clientX)));
    try {
      localStorage.setItem('ai_assistant_drawer_width', String(drawerWidthPx.value));
    } catch {
      // 忽略
    }
  }
  function onUp() {
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
  }
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}

// ===== T6-U2：暗色跟随宿主 =====
// 宿主在 html 上挂/摘 .dark 时，抽屉根同步加 ai-theme-dark（CSS 变量在
// design-tokens.css 以 .ai-theme-dark 选择器作用域化，不污染宿主全局变量）
const isHostDark = ref(
  typeof document !== 'undefined' &&
    document.documentElement.classList.contains('dark'),
);
let themeObserver: MutationObserver | null = null;
const effectiveDark = computed(() =>
  props.theme === 'auto' ? isHostDark.value : props.theme === 'dark',
);

/** 合并：默认 + 外部传入的 rootClassName + 主题类 */
const drawerRootClass = computed(() =>
  [
    'ai-assistant-drawer',
    props.rootClassName,
    effectiveDark.value ? 'ai-theme-dark' : '',
  ]
    .filter(Boolean)
    .join(' '),
);

/** 后端未连通时入口按钮显示红点（除 checking/idle 的中间态外都标记） */
const showOfflineDot = computed(
  () => health.value.state === 'disconnected',
);

function toggle() {
  open.value = !open.value;
}

/**
 * 抽屉从关闭变打开：触发一次健康检查（如果 30s TTL 内已检查过则直接复用）
 * 这样设计的好处：抽屉关闭期间后端如果被关闭，下次打开会立即感知
 */
watch(open, (isOpen) => {
  if (isOpen) {
    void checkBackendHealth();
    // 每次打开面板检查一次 SDK 升级（首次加载在 onMounted）
    void runSdkUpdateCheck();
  }
  // 感知管线联动：抽屉关闭暂停 DOM 观察（省 CPU），打开恢复并重采集
  pagePerception.setActive(isOpen);
});

// ===== PP2 感知管线挂接：路由监听 + 可见性门控 =====
// 挂载即启动（与抽屉开关无关：页面感知服务于会话上下文，抽屉仅门控观察）
onMounted(() => {
  // 首次加载组件：检查一次 SDK 升级
  void runSdkUpdateCheck();
  pagePerception.start(resolvedConfig.route, resolvedConfig.mainContentSelector);
  // T16：窄屏视口监听（<768px 全屏宽度）
  const onResize = () => {
    isNarrow.value = window.innerWidth < 768;
  };
  window.addEventListener('resize', onResize);
  onBeforeUnmount(() => window.removeEventListener('resize', onResize));
  // S6 修复:start 只挂监听(内核首采由路由变化/变异驱动),
  // 挂载后显式触发一次当前路由的首采,否则快照与度量埋点要等首次交互
  const routeProvider = resolvedConfig.route;
  if (routeProvider) {
    const firstPath = routeProvider.getRoute().path ?? '/';
    pagePerception.handleRouteChange(firstPath);
  }
  // T6-U2：观察宿主主题切换（html class 变更 → 同步抽屉暗色）
  if (props.theme === 'auto' && typeof document !== 'undefined') {
    themeObserver = new MutationObserver(() => {
      isHostDark.value = document.documentElement.classList.contains('dark');
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
  }
});

onBeforeUnmount(() => {
  themeObserver?.disconnect();
  themeObserver = null;
  void pagePerception.stop();
});

// PP4 后端健康联动：断连 → 感知会话 degraded（暂停远程依赖，本地 DOM 统计
// 仍可用）；恢复 → 自动重采集。中间态（checking/idle）不干预。
watch(
  () => health.value.state,
  (state) => {
    if (state === 'disconnected') {
      pagePerception.setDegraded(true);
    } else if (state === 'connected') {
      pagePerception.setDegraded(false);
    }
  },
);

// ===== T6 宿主业务上下文:静态 prop 初始化 + 实例方法动态覆盖 =====
const hostContextStore = createHostBusinessContextStore(props.config?.businessContext);
provide(AI_ASSISTANT_HOST_CONTEXT_KEY, hostContextStore);

defineExpose({
  toggle,
  open,
  /** T6:动态注入宿主业务上下文(权威感知源;校验失败显式抛错) */
  setBusinessContext: hostContextStore.set,
  /** T6:清除宿主业务上下文 */
  clearBusinessContext: hostContextStore.clear,
});
</script>

<template>
  <a-tooltip placement="bottom" :mouse-enter-delay="0.4">
    <button
      type="button"
      class="flex h-8 w-8 items-center justify-center rounded-md transition-colors"
      :class="
        open
          ? 'bg-primary/10 text-primary'
          : 'text-foreground hover:bg-accent'
      "
      aria-label="AI 助手"
      @click="toggle"
    >
      <component :is="SparklesIcon" class="h-[18px] w-[18px]" />
    </button>
    <template #title>
      <span>{{ showOfflineDot ? 'AI 助手 · 后端未连通' : 'AI 助手' }}</span>
    </template>
  </a-tooltip>

  <a-drawer
    v-model:open="open"
    placement="right"
    :width="actualWidth"
    :body-style="{ padding: '0', display: 'flex', flexDirection: 'column' }"
    :header-style="{ display: 'none' }"
    :mask="false"
    :mask-closable="false"
    :closable="false"
    :root-class-name="drawerRootClass"
  >
    <div class="relative flex h-full flex-col bg-background">
      <!-- T16：左缘拖拽把手（宽度 560-960 记忆于 localStorage） -->
      <div
        v-if="!isNarrow"
        class="absolute inset-y-0 left-0 z-10 w-1 cursor-col-resize transition-colors hover:bg-primary/30"
        title="拖拽调整宽度"
        @mousedown="startResize"
      />
      <div v-if="isNarrow" class="flex h-1 w-full items-center justify-center">
        <span class="h-0.5 w-10 rounded-full bg-muted-foreground/30" />
      </div>
      <div
        class="flex h-[42px] flex-shrink-0 items-center justify-between border-b border-border px-3"
      >
        <div class="flex items-center gap-2">
          <div
            class="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-[10px] font-medium text-primary-foreground"
          >
            <component :is="SparklesIcon" class="h-3.5 w-3.5" />
          </div>
          <span class="text-[13px] font-medium">AI 助手</span>
        </div>
        <button
          class="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="关闭"
          @click="open = false"
        >
          <component :is="XIcon" class="h-4 w-4" />
        </button>
      </div>
      <div class="min-h-0 flex-1">
        <AiAssistantContent />
      </div>
    </div>
  </a-drawer>
</template>

<style>
.ai-assistant-drawer .ant-drawer-content {
  border-left: 1px solid hsl(var(--border));
  border-radius: 0;
}
</style>