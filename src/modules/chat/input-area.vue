<script lang="ts" setup>
import { createIconifyIcon } from '../../providers/icons';

import { computed, nextTick, onMounted, ref, watch } from 'vue';

import type { ContextItem } from '../../types';

import { listKnowledgeBases } from '../../api/knowledge';
import { listEnabledSkills } from '../../api/skill';

defineOptions({ name: 'AiChatInputArea' });

const props = defineProps<{
  loading?: boolean;
  context?: ContextItem[];
  /** 当前选中的模型 ID（与 modelOptions 的 value 对齐），空串表示未选中 */
  modelId?: string;
  modelOptions?: Array<{ label: string; value: string }>;
}>();

const emit = defineEmits<{
  send: [text: string];
  stop: [];
  retry: [];
  'update:context': [ContextItem[]];
  'update:modelId': [string];
}>();

const SendIcon = createIconifyIcon('lucide:arrow-up');
const StopIcon = createIconifyIcon('lucide:square');
const AtIcon = createIconifyIcon('lucide:at-sign');
const SlashIcon = createIconifyIcon('lucide:slash');
const XIcon = createIconifyIcon('lucide:x');
const PaperclipIcon = createIconifyIcon('lucide:paperclip');
const ImageIcon = createIconifyIcon('lucide:image');
const FileIcon = createIconifyIcon('lucide:file-text');

const text = ref('');
const textareaRef = ref<HTMLTextAreaElement>();

// ===== @ 引用 / 斜杠命令 候选数据（真实 API） =====
// @候选：知识库（Web 端无文件系统访问，仅支持 @知识库 引用）
const knowledgeCandidates = ref<ContextItem[]>([]);
// /命令：已启用 Skill 的触发词
const slashCommands = ref<Array<{ name: string; description: string; icon: string }>>([]);

async function loadCandidates() {
  try {
    const [kbs, skills] = await Promise.all([
      listKnowledgeBases(),
      listEnabledSkills(),
    ]);
    knowledgeCandidates.value = kbs.map((kb) => ({
      id: kb.id,
      type: 'knowledge' as const,
      label: `知识库：${kb.name}`,
      ref: `kb://${kb.id}`,
    }));
    slashCommands.value = skills.flatMap((s) =>
      (s.triggerKeywords ?? []).map((kw) => ({
        name: kw.startsWith('/') ? kw : `/${kw}`,
        description: s.description,
        icon: s.icon || 'lucide:sparkles',
      })),
    );
  } catch {
    // 加载失败：候选为空，不影响输入
    knowledgeCandidates.value = [];
    slashCommands.value = [];
  }
}

onMounted(loadCandidates);

// ===== @ 引用 / 斜杠命令 弹层 =====
const mentionOpen = ref(false);
const mentionItems = ref<ContextItem[]>([]);
const mentionIndex = ref(0);

const slashOpen = ref(false);
const slashItems = computed(() => slashCommands.value);
const slashIndex = ref(0);

const canSend = computed(() => text.value.trim().length > 0 && !props.loading);

/**
 * 模型下拉框双向绑定的本地状态。
 * - props.modelId 为空（首次渲染 / 尚未加载模型列表）时，默认取 modelOptions[0]
 * - 用户手动切换时通过 emit('update:modelId') 通知父组件同步
 */
const selectedModelId = computed({
  get(): string {
    return props.modelId || props.modelOptions?.[0]?.value || '';
  },
  set(v: string) {
    emit('update:modelId', v);
  },
});

function autoResize() {
  const el = textareaRef.value;
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${Math.min(el.scrollHeight, 168)}px`;
}

watch(text, () => nextTick(autoResize));

function detectTrigger() {
  const el = textareaRef.value;
  if (!el) return;
  const value = el.value;
  const caret = el.selectionStart ?? value.length;
  // 向左查找最近一个未闭合的 @ 或 /
  let at = -1;
  let slash = -1;
  for (let i = caret - 1; i >= 0; i--) {
    const ch = value[i];
    if (ch === '\n') break;
    if (ch === ' ') {
      if (at >= 0 || slash >= 0) break;
      continue;
    }
    if (ch === '@' && at < 0 && slash < 0) at = i;
    if (ch === '/' && at < 0 && slash < 0 && i === 0) slash = i;
    if (ch === '/' && at < 0 && slash < 0 && value[i - 1] === '\n') slash = i;
  }
  if (at >= 0) {
    const query = value.slice(at + 1, caret).toLowerCase();
    mentionItems.value = knowledgeCandidates.value.filter((c) =>
      c.label.toLowerCase().includes(query),
    );
    mentionOpen.value = mentionItems.value.length > 0;
    mentionIndex.value = 0;
  } else {
    mentionOpen.value = false;
  }
  if (slash >= 0) {
    const query = value.slice(slash + 1, caret).toLowerCase();
    const filtered = slashCommands.value.filter((c) =>
      c.name.toLowerCase().includes(query),
    );
    slashOpen.value = filtered.length > 0;
    slashIndex.value = 0;
  } else {
    slashOpen.value = false;
  }
}

function insertMention(item: ContextItem) {
  const el = textareaRef.value;
  if (!el) return;
  const caret = el.selectionStart ?? text.value.length;
  const before = text.value.slice(0, caret);
  const after = text.value.slice(caret);
  const at = before.lastIndexOf('@');
  const newText = `${before.slice(0, at)}@${item.label} `;
  text.value = newText + after;
  mentionOpen.value = false;
  emit('update:context', [...(props.context ?? []), item]);
  nextTick(() => {
    el.focus();
    const pos = newText.length;
    el.setSelectionRange(pos, pos);
    autoResize();
  });
}

function insertSlash(name: string) {
  const el = textareaRef.value;
  if (!el) return;
  const caret = el.selectionStart ?? text.value.length;
  const before = text.value.slice(0, caret);
  const after = text.value.slice(caret);
  const slash = before.lastIndexOf('/');
  const newText = `${before.slice(0, slash)}${name} `;
  text.value = newText + after;
  slashOpen.value = false;
  nextTick(() => {
    el.focus();
    const pos = newText.length;
    el.setSelectionRange(pos, pos);
    autoResize();
  });
}

function removeContext(id: string) {
  emit(
    'update:context',
    (props.context ?? []).filter((c) => c.id !== id),
  );
}

// ===== 文件上传 =====
const fileInputRef = ref<HTMLInputElement>();
const imageInputRef = ref<HTMLInputElement>();
const uploadMenuOpen = ref(false);

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'];

function isImageFile(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return IMAGE_EXTENSIONS.includes(ext);
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function handleFiles(files: FileList | null) {
  if (!files || files.length === 0) return;
  const items: ContextItem[] = [];
  for (const file of Array.from(files)) {
    const isImage = isImageFile(file.name);
    items.push({
      id: `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      label: `${file.name} (${formatSize(file.size)})`,
      ref: file.name,
      type: isImage ? 'image' : 'file',
    });
  }
  emit('update:context', [...(props.context ?? []), ...items]);
  uploadMenuOpen.value = false;
}

function onFileChange(e: Event) {
  const target = e.target as HTMLInputElement;
  handleFiles(target.files);
  target.value = '';
}

function openFilePicker() {
  fileInputRef.value?.click();
}

function openImagePicker() {
  imageInputRef.value?.click();
}

function onUploadMenuBlur() {
  setTimeout(() => {
    uploadMenuOpen.value = false;
  }, 150);
}

function onInput() {
  detectTrigger();
}

function onBlur() {
  // 延迟关闭，允许点击候选项
  setTimeout(() => {
    mentionOpen.value = false;
    slashOpen.value = false;
  }, 150);
}

function onKeydown(e: KeyboardEvent) {
  // 弹层导航
  if (mentionOpen.value) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      mentionIndex.value =
        (mentionIndex.value + 1) % mentionItems.value.length;
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      mentionIndex.value =
        (mentionIndex.value - 1 + mentionItems.value.length) %
        mentionItems.value.length;
      return;
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      insertMention(mentionItems.value[mentionIndex.value]!);
      return;
    }
    if (e.key === 'Escape') {
      mentionOpen.value = false;
      return;
    }
  }
  if (slashOpen.value) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      slashIndex.value = (slashIndex.value + 1) % slashItems.value.length;
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      slashIndex.value =
        (slashIndex.value - 1 + slashItems.value.length) %
        slashItems.value.length;
      return;
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      insertSlash(slashItems.value[slashIndex.value]!.name);
      return;
    }
    if (e.key === 'Escape') {
      slashOpen.value = false;
      return;
    }
  }
  // Enter 发送
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    doSend();
  }
}

function doSend() {
  const content = text.value.trim();
  if (!content || props.loading) return;
  emit('send', content);
  text.value = '';
  nextTick(autoResize);
}

function doStop() {
  emit('stop');
}

defineExpose({ focus: () => textareaRef.value?.focus() });
</script>

<template>
  <div class="chat-input-area flex flex-col gap-2 border-t border-border bg-background px-3 pt-2.5">
    <!-- 上下文引用 chips -->
    <div v-if="context && context.length > 0" class="flex flex-wrap gap-1">
      <span
        v-for="c in context"
        :key="c.id"
        class="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px]"
        :class="{
          'bg-primary/10 text-primary': c.type !== 'image' && c.type !== 'file',
          'bg-violet-500/10 text-violet-500': c.type === 'image',
          'bg-blue-500/10 text-blue-500': c.type === 'file',
        }"
      >
        <component
          :is="
            c.type === 'image'
              ? ImageIcon
              : c.type === 'file'
                ? FileIcon
                : AtIcon
          "
          class="h-3 w-3 flex-shrink-0"
        />
        <span class="max-w-[200px] truncate">{{ c.label }}</span>
        <button
          type="button"
          class="hover:opacity-60"
          @click="removeContext(c.id)"
        >
          <component :is="XIcon" class="h-3 w-3" />
        </button>
      </span>
    </div>

    <div class="relative">
      <!-- @ 候选 -->
      <div
        v-if="mentionOpen"
        class="absolute bottom-full left-0 mb-1 max-h-[220px] w-[280px] overflow-auto rounded-lg border border-border bg-popover shadow-lg"
      >
        <div class="px-2.5 py-1 text-[11px] text-muted-foreground">
          引用上下文
        </div>
        <button
          v-for="(item, i) in mentionItems"
          :key="item.id"
          type="button"
          class="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12px] hover:bg-accent"
          :class="i === mentionIndex ? 'bg-accent' : ''"
          @mouseenter="mentionIndex = i"
          @click="insertMention(item)"
        >
          <span class="text-muted-foreground">@</span>
          <span class="truncate">{{ item.label }}</span>
        </button>
      </div>

      <!-- / 候选 -->
      <div
        v-if="slashOpen"
        class="absolute bottom-full left-0 mb-1 max-h-[220px] w-[300px] overflow-auto rounded-lg border border-border bg-popover shadow-lg"
      >
        <div class="px-2.5 py-1 text-[11px] text-muted-foreground">
          技能命令
        </div>
        <button
          v-for="(item, i) in slashItems"
          :key="item.name"
          type="button"
          class="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-accent"
          :class="i === slashIndex ? 'bg-accent' : ''"
          @mouseenter="slashIndex = i"
          @click="insertSlash(item.name)"
        >
          <component :is="SlashIcon" class="h-3.5 w-3.5 text-primary" />
          <div class="min-w-0 flex-1">
            <div class="text-[12px] font-medium">{{ item.name }}</div>
            <div class="truncate text-[11px] text-muted-foreground">
              {{ item.description }}
            </div>
          </div>
        </button>
      </div>

      <div
        class="flex items-end gap-2 rounded-xl border border-border bg-card px-3 py-2 focus-within:border-primary/50"
      >
        <!-- 附件按钮 -->
        <div class="relative flex-shrink-0">
          <button
            type="button"
            class="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            :class="uploadMenuOpen ? 'bg-accent text-foreground' : ''"
            aria-label="上传文件"
            @click="uploadMenuOpen = !uploadMenuOpen"
            @blur="onUploadMenuBlur"
          >
            <component :is="PaperclipIcon" class="h-4 w-4" />
          </button>
          <!-- 上传菜单 -->
          <div
            v-if="uploadMenuOpen"
            class="absolute bottom-full left-0 mb-1 w-[160px] rounded-lg border border-border bg-popover shadow-lg"
          >
            <button
              type="button"
              class="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12px] hover:bg-accent"
              @mousedown.prevent="openFilePicker"
            >
              <component :is="FileIcon" class="h-3.5 w-3.5 text-blue-500" />
              上传文件
            </button>
            <button
              type="button"
              class="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12px] hover:bg-accent"
              @mousedown.prevent="openImagePicker"
            >
              <component :is="ImageIcon" class="h-3.5 w-3.5 text-violet-500" />
              上传图片
            </button>
          </div>
        </div>

        <textarea
          ref="textareaRef"
          v-model="text"
          rows="1"
          placeholder="输入问题，Enter 发送 / Shift+Enter 换行；@ 引用上下文，/ 触发技能"
          class="max-h-[168px] min-h-[24px] flex-1 resize-none border-0 bg-transparent p-0 text-[13px] leading-6 outline-none placeholder:text-muted-foreground/60"
          @input="onInput"
          @keydown="onKeydown"
          @blur="onBlur"
        />

        <div class="flex flex-shrink-0 items-center gap-1.5">
          <select
            v-if="modelOptions && modelOptions.length"
            v-model="selectedModelId"
            class="h-7 cursor-pointer rounded-md border border-border bg-background px-2 text-[11px] outline-none transition-colors hover:border-primary/40"
          >
            <option v-for="m in modelOptions" :key="m.value" :value="m.value">
              {{ m.label }}
            </option>
          </select>

          <button
            v-if="loading"
            type="button"
            class="flex h-7 w-7 items-center justify-center rounded-lg bg-red-500/10 text-red-500 transition-colors hover:bg-red-500/20"
            aria-label="停止生成"
            @click="doStop"
          >
            <component :is="StopIcon" class="h-3.5 w-3.5" />
          </button>
          <button
            v-else
            type="button"
            class="flex h-7 w-7 items-center justify-center rounded-lg transition-colors"
            :class="
              canSend
                ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                : 'cursor-not-allowed bg-muted text-muted-foreground'
            "
            :disabled="!canSend"
            aria-label="发送"
            @click="doSend"
          >
            <component :is="SendIcon" class="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <!-- 隐藏的文件输入 -->
      <input
        ref="fileInputRef"
        type="file"
        multiple
        class="hidden"
        @change="onFileChange"
      />
      <input
        ref="imageInputRef"
        type="file"
        accept="image/*"
        multiple
        class="hidden"
        @change="onFileChange"
      />
    </div>
  </div>
</template>