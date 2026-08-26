<script lang="ts" setup>
import { message } from 'ant-design-vue';

import { reactive, ref } from 'vue';

import { invokeTool, type SchemaPage, type SchemaSection } from '../api/market';

/**
 * 声明式页面渲染器（UI 插件 type=schema-page）。
 *
 * 安全边界：只解释数据声明（sections/fields/工具绑定），不执行任何插件代码、
 * 不使用 v-html；工具调用经后端 invoke 端点（含审计与租户隔离）。
 */
const props = defineProps<{ page: SchemaPage; serverId: string; toolWhitelist: string[] }>();

const loadingTool = ref('');
const errorText = ref('');
/** form 提交结果：asTable 时展示表格，否则展示文本 */
const formResult = ref<{ asTable: boolean; columns: string[]; rows: string[][]; text: string } | null>(null);
const formData = reactive<Record<string, any>>({});

function toolAllowed(tool: string): boolean {
  return props.toolWhitelist.includes(tool);
}

async function callTool(tool: string, args?: Record<string, unknown>): Promise<any> {
  if (!toolAllowed(tool)) {
    throw new Error(`工具不在本插件清单内: ${tool}`);
  }
  const raw = await invokeTool(props.serverId, tool, args);
  // McpToolsService 返回 JSON 序列化字符串
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function pickField(body: any, field: string): string {
  const value = field.split('.').reduce((acc: any, key) => acc?.[key], body);
  return value === undefined || value === null ? '-' : String(value);
}

async function loadSection(tool: string, field: string, target: (v: string) => void) {
  loadingTool.value = tool;
  errorText.value = '';
  try {
    const body = await callTool(tool);
    target(pickField(body, field));
  } catch (error) {
    target('-');
    errorText.value = error instanceof Error ? error.message : '加载失败';
  } finally {
    loadingTool.value = '';
  }
}

// stats 卡片值缓存
const statValues = reactive<Record<string, string>>({});
function statKey(sectionIndex: number, cardIndex: number) {
  return `s-${sectionIndex}-${cardIndex}`;
}

// list 行缓存
const listRows = reactive<Record<number, string[][]>>({});
async function loadList(sectionIndex: number, section: Extract<SchemaSection, { type: 'list' }>) {
  loadingTool.value = section.tool;
  errorText.value = '';
  try {
    const body = await callTool(section.tool);
    const raw: any[] = Array.isArray(body) ? body : (body?.[section.dataField ?? 'data'] ?? []);
    listRows[sectionIndex] = (raw as any[]).slice(0, 50).map((row) =>
      section.columns.map((c) => pickField(row, c.key)),
    );
  } catch (error) {
    errorText.value = error instanceof Error ? error.message : '加载失败';
  } finally {
    loadingTool.value = '';
  }
}

function sectionMounted(section: SchemaSection, index: number) {
  if (section.type === 'stats') {
    section.cards.forEach((card, ci) => {
      void loadSection(card.tool, card.field, (v) => {
        statValues[statKey(index, ci)] = v;
      });
    });
  } else if (section.type === 'list') {
    void loadList(index, section);
  }
}

async function submitForm(section: Extract<SchemaSection, { type: 'form' }>) {
  loadingTool.value = section.submit.tool;
  errorText.value = '';
  formResult.value = null;
  try {
    const body = await callTool(section.submit.tool, { ...formData });
    const result = section.submit.resultField
      ? (body as any)?.[section.submit.resultField] ?? body
      : body;
    if (section.submit.asTable && Array.isArray(result)) {
      const columns = Object.keys(result[0] ?? {});
      formResult.value = {
        asTable: true,
        columns,
        rows: (result as any[]).slice(0, 50).map((row) => columns.map((c) => pickField(row, c))),
        text: '',
      };
    } else {
      formResult.value = {
        asTable: false,
        columns: [],
        rows: [],
        text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
      };
    }
  } catch (error) {
    errorText.value = error instanceof Error ? error.message : '调用失败';
    message.error(errorText.value);
  } finally {
    loadingTool.value = '';
  }
}
</script>

<template>
  <div class="flex h-full flex-col">
    <div v-if="errorText" class="mb-2 rounded-md border border-red-500/30 bg-red-500/5 px-2.5 py-1.5 text-[11px] text-red-500">
      {{ errorText }}
    </div>
    <div class="min-h-0 flex-1 overflow-auto">
      <div v-for="(section, i) in page.sections" :key="i">
        <!-- 指标卡 -->
        <div v-if="section.type === 'stats'" class="mb-3 grid grid-cols-2 gap-2">
          <div
            v-for="(card, ci) in section.cards"
            :key="card.label"
            class="rounded-lg border border-border bg-card p-3"
            @vue:mounted="sectionMounted(section, i)"
          >
            <div class="text-[11px] text-muted-foreground">{{ card.label }}</div>
            <div class="mt-1 text-[18px] font-semibold">
              <span v-if="loadingTool === card.tool" class="text-[12px] text-muted-foreground">加载中…</span>
              <template v-else>{{ statValues[statKey(i, ci)] ?? '…' }}<span class="ml-0.5 text-[11px] font-normal text-muted-foreground">{{ card.unit }}</span></template>
            </div>
          </div>
        </div>

        <!-- 列表 -->
        <div v-else-if="section.type === 'list'" class="mb-3">
          <div v-if="section.title" class="mb-1.5 text-[12px] font-medium text-muted-foreground">{{ section.title }}</div>
          <div class="rounded-lg border border-border bg-card" @vue:mounted="sectionMounted(section, i)">
            <div v-if="loadingTool === section.tool" class="p-4 text-center text-[12px] text-muted-foreground">加载中…</div>
            <div v-else-if="(listRows[i]?.length ?? 0) === 0" class="p-4 text-center text-[12px] text-muted-foreground">暂无数据</div>
            <table v-else class="w-full text-[12px]">
              <thead>
                <tr class="border-b border-border text-left text-[11px] text-muted-foreground">
                  <th v-for="c in section.columns" :key="c.key" class="px-2.5 py-1.5 font-medium">{{ c.label }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, ri) in listRows[i]" :key="ri" class="border-b border-border/50 last:border-none">
                  <td v-for="(cell, ci) in row" :key="ci" class="px-2.5 py-1.5">{{ cell }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- 表单 -->
        <div v-else-if="section.type === 'form'" class="mb-3 rounded-lg border border-border bg-card p-3">
          <div v-if="section.title" class="mb-2 text-[12px] font-medium text-muted-foreground">{{ section.title }}</div>
          <div class="space-y-2">
            <div v-for="f in section.fields" :key="f.key" class="flex items-center gap-2">
              <label class="w-20 flex-shrink-0 text-[12px] text-muted-foreground">{{ f.label }}</label>
              <select
                v-if="f.type === 'select'"
                v-model="formData[f.key]"
                class="h-7 flex-1 rounded-md border border-border bg-transparent px-2 text-[12px]"
              >
                <option v-for="opt in f.options" :key="opt" :value="opt">{{ opt }}</option>
              </select>
              <input
                v-else
                v-model="formData[f.key]"
                :type="f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'"
                class="h-7 flex-1 rounded-md border border-border bg-transparent px-2 text-[12px] outline-none focus:border-primary/50"
              />
            </div>
          </div>
          <button
            class="mt-3 h-7 rounded-md bg-primary px-3 text-[12px] text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            :disabled="loadingTool === section.submit.tool"
            @click="submitForm(section)"
          >
            {{ loadingTool === section.submit.tool ? '提交中…' : section.submit.label }}
          </button>
          <div v-if="formResult?.asTable" class="mt-3 overflow-auto">
            <table class="w-full text-[12px]">
              <thead><tr class="border-b border-border text-left text-[11px] text-muted-foreground">
                <th v-for="c in formResult.columns" :key="c" class="px-2 py-1 font-medium">{{ c }}</th>
              </tr></thead>
              <tbody><tr v-for="(row, ri) in formResult.rows" :key="ri" class="border-b border-border/50 last:border-none">
                <td v-for="(cell, ci) in row" :key="ci" class="px-2 py-1">{{ cell }}</td>
              </tr></tbody>
            </table>
          </div>
          <pre v-else-if="formResult?.text" class="mt-3 max-h-60 overflow-auto rounded-md bg-muted/40 p-2 text-[11px] leading-relaxed">{{ formResult.text }}</pre>
        </div>
      </div>
    </div>
  </div>
</template>
