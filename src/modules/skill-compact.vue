<script lang="ts" setup>
import { createIconifyIcon } from '../providers/icons';
import { Input, InputNumber, message, Modal, Popconfirm } from 'ant-design-vue';

import { computed, h, onMounted, reactive, ref } from 'vue';

import type { SkillCategoryVO } from '../api/skill';
import type { Skill, SkillCategory } from '../types';

import { skillCategoryMap } from '../constants';
import {
  deleteSkillCategory,
  listSkillCategories,
  listSkills,
  saveSkill,
  saveSkillCategory,
  toggleSkillEnabled,
} from '../api/skill';
import { useBackendHealth } from '../composables/use-backend-health';

import SkillForm from './skill-form.vue';

defineOptions({ name: 'AiSkillCompact' });

const PlusIcon = createIconifyIcon('lucide:plus');
const ChevronIcon = createIconifyIcon('lucide:chevron-down');
const TerminalIcon = createIconifyIcon('lucide:terminal');
const SettingsIcon = createIconifyIcon('lucide:settings-2');
const TrashIcon = createIconifyIcon('lucide:trash-2');

const _iconCache = new Map<string, ReturnType<typeof createIconifyIcon>>();
const SkillIcon = (props: { icon?: string }) => {
  const icon = props.icon;
  if (!icon) return h('span', { class: 'text-[13px]' }, '⚡');
  let comp = _iconCache.get(icon);
  if (!comp) {
    comp = createIconifyIcon(icon);
    _iconCache.set(icon, comp);
  }
  return h(comp, { class: 'h-4 w-4' });
};

const skills = ref<Skill[]>([]);
const loading = ref(false);
const activeCategory = ref<SkillCategory | 'all'>('all');
const expandedId = ref<string>('');
const formOpen = ref(false);
const editingData = ref<Skill | null>(null);

const health = useBackendHealth();

// ===== 动态分类 =====
const categories = ref<SkillCategoryVO[]>([]);
const categoryManageOpen = ref(false);
const categorySaving = ref(false);
const newCategoryForm = reactive({
  categoryKey: '',
  categoryName: '',
  color: '#6b7280',
  sortOrder: 50,
  description: '',
});

async function loadSkills() {
  loading.value = true;
  try {
    skills.value = await listSkills();
  } catch {
    skills.value = [];
  } finally {
    loading.value = false;
  }
}

async function loadCategories() {
  try {
    categories.value = await listSkillCategories();
  } catch {
    categories.value = [];
  }
}

const filtered = computed(() => {
  if (activeCategory.value === 'all') return skills.value;
  return skills.value.filter((s) => s.category === activeCategory.value);
});

/**
 * 分类元数据查找表：key -> { name, color }
 * 优先用后端动态数据；兜底用前端常量 skillCategoryMap（避免 fetch 前空白）。
 */
const categoryLookup = computed(() => {
  const map: Record<string, { name: string; color: string }> = {};
  for (const [key, val] of Object.entries(skillCategoryMap)) {
    map[key] = { name: val.text, color: '#6b7280' };
  }
  for (const c of categories.value) {
    map[c.categoryKey] = {
      name: c.categoryName,
      color: c.color || '#6b7280',
    };
  }
  return map;
});

/**
 * 分类筛选 chips（含"全部" + 动态分类，附带各分类技能数量）
 */
const categoryChips = computed(() => {
  const all = [{ key: 'all', label: '全部', count: skills.value.length }];
  for (const c of categories.value) {
    all.push({
      key: c.categoryKey,
      label: c.categoryName,
      count: c.skillCount ?? 0,
    });
  }
  return all;
});

function getMeta(cat: string): { name: string; color: string } {
  return categoryLookup.value[cat] || { name: cat, color: '#6b7280' };
}

function toggle(id: string) {
  expandedId.value = expandedId.value === id ? '' : id;
}

async function toggleEnabled(skill: Skill) {
  if (skill.isBuiltin) return;
  const next = !skill.enabled;
  try {
    await toggleSkillEnabled(skill.id, next);
    skill.enabled = next;
  } catch {
    message.error('切换失败');
  }
}

function handleAdd() {
  editingData.value = null;
  formOpen.value = true;
}

// ===== 分类管理：新增 =====
function openCategoryManage() {
  newCategoryForm.categoryKey = '';
  newCategoryForm.categoryName = '';
  newCategoryForm.color = '#6b7280';
  newCategoryForm.sortOrder = 50;
  newCategoryForm.description = '';
  categoryManageOpen.value = true;
}

async function handleAddCategory() {
  const key = newCategoryForm.categoryKey.trim();
  const name = newCategoryForm.categoryName.trim();
  if (!key || !name) {
    message.warning('请填写分类标识和名称');
    return;
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(key)) {
    message.warning('分类标识仅支持字母、数字、下划线和连字符');
    return;
  }
  if (categories.value.some((c) => c.categoryKey === key)) {
    message.warning('分类标识已存在');
    return;
  }
  categorySaving.value = true;
  try {
    await saveSkillCategory({
      categoryKey: key,
      categoryName: name,
      color: newCategoryForm.color,
      sortOrder: newCategoryForm.sortOrder,
      description: newCategoryForm.description.trim(),
      enabled: true,
    });
    message.success(`分类「${name}」已创建`);
    await loadCategories();
    newCategoryForm.categoryKey = '';
    newCategoryForm.categoryName = '';
    newCategoryForm.color = '#6b7280';
    newCategoryForm.sortOrder = 50;
    newCategoryForm.description = '';
  } catch {
    message.error('创建分类失败');
  } finally {
    categorySaving.value = false;
  }
}

// ===== 分类管理：删除 =====
async function handleDeleteCategory(c: SkillCategoryVO) {
  try {
    const migrated = await deleteSkillCategory(c.id);
    if (migrated && migrated > 0) {
      message.success(`已删除分类「${c.categoryName}」，${migrated} 个技能已归入「自定义」`);
    } else {
      message.success(`已删除分类「${c.categoryName}」`);
    }
    // 若删除的是当前选中分类，回退到全部
    if (activeCategory.value === c.categoryKey) {
      activeCategory.value = 'all';
    }
    await Promise.all([loadCategories(), loadSkills()]);
  } catch (e: any) {
    message.error(e?.message || '删除失败');
  }
}

async function handleSubmit(data: Partial<Skill>) {
  try {
    const id = await saveSkill({
      name: data.name ?? '未命名',
      description: data.description ?? '',
      icon: data.icon ?? 'lucide:wand-sparkles',
      category: data.category ?? 'custom',
      promptTemplate: data.promptTemplate ?? '',
      parameters: data.parameters ?? [],
      allowedTools: data.allowedTools ?? [],
      triggerKeywords: data.triggerKeywords ?? [],
      enabled: data.enabled ?? true,
    });
    const newSkill: Skill = {
      id,
      name: data.name ?? '未命名',
      description: data.description ?? '',
      icon: data.icon ?? 'lucide:wand-sparkles',
      category: data.category ?? 'custom',
      promptTemplate: data.promptTemplate ?? '',
      parameters: data.parameters ?? [],
      allowedTools: data.allowedTools ?? [],
      triggerKeywords: data.triggerKeywords ?? [],
      enabled: data.enabled ?? true,
      isBuiltin: false,
      version: data.version ?? '1.0.0',
      usageCount: 0,
      updatedAt: Date.now(),
    };
    skills.value.unshift(newSkill);
    message.success(`技能 ${newSkill.name} 已创建`);
  } catch {
    message.error('创建失败');
  }
}

onMounted(() => {
  if (health.value.state === 'disconnected') return;
  loadSkills();
  loadCategories();
});
</script>

<template>
  <!-- 离线占位：整页替换 -->
  <div
    v-if="health.state === 'disconnected'"
    class="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-[12px] text-muted-foreground"
  >
    <div class="text-2xl">⚠</div>
    <div>后端未连接，无法加载技能列表</div>
    <div class="text-[11px] opacity-70">请在设置 → 后端服务 配置服务地址</div>
  </div>
  <div v-else class="flex h-full flex-col">
    <div
      class="flex h-[38px] flex-shrink-0 items-center justify-between border-b border-border bg-background px-3"
    >
      <span class="text-[13px] font-medium">Skill 管理</span>
      <div class="flex items-center gap-1.5">
        <button
          class="flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:border-primary/40 hover:text-primary"
          title="管理分类（新增/删除）"
          @click="openCategoryManage"
        >
          <component :is="SettingsIcon" class="h-3 w-3" />
          分类
        </button>
        <button
          class="flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-0.5 text-[11px] text-muted-foreground hover:border-primary/40 hover:text-primary"
          @click="handleAdd"
        >
          <component :is="PlusIcon" class="h-3 w-3" />
          新建
        </button>
      </div>
    </div>

    <!-- 分类筛选（动态，含技能数量） -->
    <div class="flex flex-shrink-0 flex-wrap items-center gap-1.5 border-b border-border px-3 py-2">
      <button
        v-for="cat in categoryChips"
        :key="cat.key"
        type="button"
        class="flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] transition-colors"
        :class="
          activeCategory === cat.key
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-muted-foreground hover:text-foreground'
        "
        @click="activeCategory = (cat.key as SkillCategory | 'all')"
      >
        {{ cat.label }}
        <span class="opacity-60">{{ cat.count }}</span>
      </button>
    </div>

    <!-- 技能列表 -->
    <div class="min-h-0 flex-1 overflow-auto p-2.5">
      <div class="space-y-1.5">
        <div
          v-for="skill in filtered"
          :key="skill.id"
          class="rounded-lg border border-border bg-card transition-colors hover:border-primary/30"
        >
          <!-- 卡片头部 -->
          <div
            class="flex cursor-pointer items-center gap-2.5 px-3 py-2"
            @click="toggle(skill.id)"
          >
            <div
              class="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md"
              :style="(() => { const m = getMeta(skill.category); return { backgroundColor: `${m.color}1a`, color: m.color }; })()"
            >
              <SkillIcon :icon="skill.icon" />
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-1.5">
                <span class="font-mono text-[12px] font-medium">{{ skill.name }}</span>
                <span
                  v-if="skill.isBuiltin"
                  class="rounded bg-muted px-1 py-px text-[9px] text-muted-foreground"
                >
                  内置
                </span>
              </div>
              <div class="truncate text-[11px] text-muted-foreground">
                {{ skill.description }}
              </div>
            </div>
            <div class="flex flex-shrink-0 items-center gap-1.5">
              <span class="text-[10px] text-muted-foreground">{{ skill.usageCount }} 次</span>
              <button
                type="button"
                :disabled="skill.isBuiltin"
                class="relative h-4 w-7 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                :class="skill.enabled ? 'bg-primary' : 'bg-muted'"
                @click.stop="toggleEnabled(skill)"
              >
                <span
                  class="absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform"
                  :class="skill.enabled ? 'left-[14px]' : 'left-0.5'"
                />
              </button>
              <component
                :is="ChevronIcon"
                class="h-3.5 w-3.5 text-muted-foreground transition-transform"
                :class="expandedId === skill.id ? 'rotate-180' : ''"
              />
            </div>
          </div>

          <!-- 展开内容 -->
          <div v-if="expandedId === skill.id" class="border-t border-border px-3 py-2.5">
            <!-- 触发词 -->
            <div class="mb-2 flex flex-wrap items-center gap-1">
              <span class="text-[10px] text-muted-foreground">触发词:</span>
              <span
                v-for="kw in skill.triggerKeywords"
                :key="kw"
                class="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
              >
                {{ kw }}
              </span>
            </div>

            <!-- Prompt 模板 -->
            <div class="mb-2">
              <div class="mb-1 text-[10px] text-muted-foreground">Prompt 模板</div>
              <pre class="max-h-[120px] overflow-auto rounded-md bg-muted p-2 text-[11px] leading-relaxed text-muted-foreground">{{ skill.promptTemplate }}</pre>
            </div>

            <!-- 参数 -->
            <div v-if="skill.parameters.length > 0" class="mb-2">
              <div class="mb-1 text-[10px] text-muted-foreground">参数</div>
              <div class="space-y-1">
                <div
                  v-for="param in skill.parameters"
                  :key="param.key"
                  class="flex items-center gap-2 text-[11px]"
                >
                  <code class="rounded bg-muted px-1 py-0.5 text-[10px]">{{ param.key }}</code>
                  <span class="text-muted-foreground">{{ param.label }}</span>
                  <span class="text-[10px] text-muted-foreground/60">({{ param.type }})</span>
                  <span v-if="param.required" class="text-[10px] text-red-500">*</span>
                </div>
              </div>
            </div>

            <!-- 授权工具 -->
            <div class="flex flex-wrap items-center gap-1">
              <span class="text-[10px] text-muted-foreground">授权工具:</span>
              <span
                v-for="tool in skill.allowedTools"
                :key="tool"
                class="flex items-center gap-0.5 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary"
              >
                <component :is="TerminalIcon" class="h-2.5 w-2.5" />
                {{ tool }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <SkillForm v-model:open="formOpen" :data="editingData" @submit="handleSubmit" />

    <!-- 分类管理 Modal（新增/删除） -->
    <Modal
      v-model:open="categoryManageOpen"
      title="分类管理"
      :footer="null"
      width="520px"
      class="ai-category-modal"
    >
      <!-- 已有分类列表 -->
      <div class="mb-4">
        <div class="mb-2 text-[12px] font-medium text-muted-foreground">
          已有分类（{{ categories.length }}）
        </div>
        <div class="max-h-[260px] space-y-1 overflow-auto pr-1">
          <div
            v-for="c in categories"
            :key="c.id"
            class="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5"
          >
            <span
              class="h-3 w-3 flex-shrink-0 rounded-full"
              :style="{ backgroundColor: c.color || '#6b7280' }"
            />
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-1.5">
                <span class="text-[12px] font-medium">{{ c.categoryName }}</span>
                <code class="rounded bg-muted px-1 text-[10px] text-muted-foreground">{{ c.categoryKey }}</code>
                <span
                  v-if="c.isBuiltin"
                  class="rounded bg-amber-500/10 px-1 text-[9px] text-amber-600"
                >
                  内置
                </span>
              </div>
              <div class="truncate text-[10px] text-muted-foreground/70">
                {{ c.description || `${c.skillCount ?? 0} 个技能` }}
              </div>
            </div>
            <Popconfirm
              :title="`确认删除分类「${c.categoryName}」？${(c.skillCount ?? 0) > 0 ? `其下 ${c.skillCount} 个技能将归入「自定义」。` : ''}`"
              ok-text="删除"
              cancel-text="取消"
              :ok-button-props="{ danger: true }"
              @confirm="handleDeleteCategory(c)"
            >
              <button
                v-if="!c.isBuiltin"
                type="button"
                class="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-red-500/10 hover:text-red-500"
                title="删除分类"
              >
                <component :is="TrashIcon" class="h-3.5 w-3.5" />
              </button>
              <span
                v-else
                class="text-[10px] text-muted-foreground/40"
                title="内置分类不可删除"
              >
                锁定
              </span>
            </Popconfirm>
          </div>
        </div>
      </div>

      <!-- 新增分类表单 -->
      <div class="rounded-md border border-dashed border-border p-3">
        <div class="mb-2 text-[12px] font-medium">新增分类</div>
        <div class="space-y-2">
          <div class="flex gap-2">
            <Input
              v-model:value="newCategoryForm.categoryKey"
              placeholder="标识（英文，如 data-analysis）"
              class="flex-1"
              size="small"
            />
            <Input
              v-model:value="newCategoryForm.categoryName"
              placeholder="名称（如 数据分析）"
              class="flex-1"
              size="small"
            />
          </div>
          <div class="flex items-center gap-2">
            <label class="text-[11px] text-muted-foreground">颜色</label>
            <input
              v-model="newCategoryForm.color"
              type="color"
              class="h-6 w-8 cursor-pointer rounded border border-border bg-transparent"
            />
            <span class="font-mono text-[10px] text-muted-foreground">{{ newCategoryForm.color }}</span>
            <label class="ml-2 text-[11px] text-muted-foreground">排序</label>
            <InputNumber
              v-model:value="newCategoryForm.sortOrder"
              :min="0"
              :max="999"
              size="small"
              class="w-16"
            />
          </div>
          <Input
            v-model:value="newCategoryForm.description"
            placeholder="描述（可选）"
            size="small"
          />
          <button
            type="button"
            :disabled="categorySaving"
            class="w-full rounded-md bg-primary py-1.5 text-[12px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            @click="handleAddCategory"
          >
            {{ categorySaving ? '创建中...' : '+ 新增分类' }}
          </button>
        </div>
      </div>
    </Modal>
  </div>
</template>