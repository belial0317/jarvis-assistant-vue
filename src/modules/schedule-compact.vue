<script lang="ts" setup>
/**
 * 定时任务模块（方案 P0 → 行业实践 UI）
 * 列表卡片 + 引导式创建/编辑表单 + cron 人话预览（参考 Zapier/n8n/Dify 调度配置范式）
 */
import { message } from 'ant-design-vue';

import { computed, onMounted, reactive, ref } from 'vue';

import {
  deleteSchedule,
  listSchedules,
  pauseSchedule,
  resumeSchedule,
  runScheduleNow,
  type AgentScheduleVO,
} from '../api/schedule';
import { listSessions, type ChatSessionVO } from '../api/chat';
import { listAgents, type AgentVO } from '../api/agent';

defineOptions({ name: 'AiSchedule' });

const schedules = ref<AgentScheduleVO[]>([]);
const loading = ref(false);

async function load() {
  loading.value = true;
  try {
    schedules.value = await listSchedules();
  } catch {
    schedules.value = [];
  } finally {
    loading.value = false;
  }
}
onMounted(load);

// ===== 会话与 Agent 选项 =====
const sessions = ref<ChatSessionVO[]>([]);
const agents = ref<AgentVO[]>([]);
async function loadOptions() {
  try {
    sessions.value = await listSessions({ pageSize: 20 });
  } catch {
    sessions.value = [];
  }
  try {
    agents.value = await listAgents({ enabled: true });
  } catch {
    agents.value = [];
  }
}

// ===== 状态徽标 =====
function statusMeta(s: AgentScheduleVO): { dot: string; label: string } {
  if (s.status === 'active') return { dot: 'bg-emerald-500', label: '运行中' };
  if (s.status === 'paused') return { dot: 'bg-amber-500', label: '已暂停' };
  if (s.status === 'failed') return { dot: 'bg-red-500', label: '连续失败' };
  if (s.status === 'done') return { dot: 'bg-muted-foreground', label: '已完成' };
  return { dot: 'bg-muted-foreground', label: s.status };
}

/** cron 人话预览（常见模式；自定义显示原文） */
function describeCron(cron?: string): string {
  if (!cron) return '';
  const p = cron.trim().split(/\s+/);
  if (p.length !== 6) return cron;
  const [, m, h, dom, mon, dow] = p;
  const weekMap: Record<string, string> = {
    MON: '周一', TUE: '周二', WED: '周三', THU: '周四', FRI: '周五', SAT: '周六', SUN: '周日',
    '2': '周一', '3': '周二', '4': '周三', '5': '周四', '6': '周五', '7': '周六', '1': '周日',
  };
  const hm = `${String(Number(h)).padStart(2, '0')}:${String(Number(m)).padStart(2, '0')}`;
  if (dom === '*' && mon === '*' && dow === '*') return `每天 ${hm}`;
  if (dom === '?' && mon === '*' && weekMap[dow]) return `每${weekMap[dow]} ${hm}`;
  if (dow === '?' && mon === '*' && dom !== '*') return `每月 ${Number(dom)} 日 ${hm}`;
  return cron;
}

function planText(s: AgentScheduleVO): string {
  return s.scheduleType === 'cron' ? describeCron(s.cronExpr) : `定点 ${s.runAt ?? ''}`;
}

// ===== 操作 =====
async function op(id: string, action: 'run' | 'pause' | 'resume' | 'delete') {
  try {
    if (action === 'run') await runScheduleNow(id);
    else if (action === 'pause') await pauseSchedule(id);
    else if (action === 'resume') await resumeSchedule(id);
    else await deleteSchedule(id);
    message.success(action === 'run' ? '已触发执行，结果将写入投递会话' : '操作成功');
    await load();
  } catch {
    message.error('操作失败');
  }
}

// ===== 创建/编辑表单 =====
const dialogOpen = ref(false);
const editingId = ref<string | null>(null);
const freq = ref<'daily' | 'weekly' | 'monthly' | 'once' | 'custom'>('daily');
const weeklyDay = ref('MON');
const form = reactive({
  name: '',
  sessionId: '' as string,
  agentId: '' as string, // '' = 自动路由（会话默认）
  prompt: '',
  time: '09:00',
  cronExpr: '',
  runAt: '',
});

const cronPreview = computed(() => {
  if (freq.value !== 'custom') {
    const [hh, mm] = (form.time || '09:00').split(':');
    const H = String(Number(hh || 0));
    const M = String(Number(mm || 0));
    if (freq.value === 'daily') {
      return { expr: `0 ${M} ${H} * * ?`, text: `每天 ${form.time}` };
    }
    if (freq.value === 'weekly') {
      const day = weekMap2[weeklyDay.value] ?? weeklyDay.value;
      return { expr: `0 ${M} ${H} ? * ${weeklyDay.value}`, text: `每${day} ${form.time}` };
    }
    return { expr: `0 ${M} ${H} 1 * ?`, text: `每月 1 日 ${form.time}` };
  }
  const t = form.cronExpr.trim();
  return t ? { expr: t, text: describeCron(t) } : { expr: '', text: '请输入 cron 表达式' };
});

const weekMap2: Record<string, string> = { MON: '周一', TUE: '周二', WED: '周三', THU: '周四', FRI: '周五', SAT: '周六', SUN: '周日' };

function openCreate() {
  editingId.value = null;
  freq.value = 'daily';
  Object.assign(form, {
    name: '',
    sessionId: sessions.value[0]?.id ?? '',
    agentId: '',
    prompt: '',
    time: '09:00',
    cronExpr: '',
    runAt: '',
  });
  void loadOptions();
  dialogOpen.value = true;
}

function openEdit(s: AgentScheduleVO) {
  editingId.value = s.id;
  Object.assign(form, {
    name: s.name,
    sessionId: s.sessionId,
    agentId: s.agentId ?? '',
    prompt: s.prompt,
    time: '09:00',
    cronExpr: s.cronExpr ?? '',
    runAt: s.runAt ?? '',
  });
  if (s.scheduleType === 'cron') {
    const p = (s.cronExpr ?? '').trim().split(/\s+/);
    if (p.length === 6) {
      form.time = `${String(Number(p[2])).padStart(2, '0')}:${String(Number(p[1])).padStart(2, '0')}`;
      if (p[3] === '*' && p[5] === '*') freq.value = 'daily';
      else if (p[3] === '?' && p[5] !== '*' && weekMap2[p[5]]) { freq.value = 'weekly'; weeklyDay.value = p[5]; }
      else if (p[5] === '?' && p[3] !== '*') { freq.value = 'monthly'; }
      else freq.value = 'custom';
    } else freq.value = 'custom';
  } else {
    freq.value = 'once'; // 定点任务编辑：回填 runAt 并保持 once 类型
  }
  void loadOptions();
  dialogOpen.value = true;
}

const submitting = ref(false);
async function submit() {
  if (!form.name.trim()) { message.warning('请输入任务名称'); return; }
  if (!form.sessionId) { message.warning('请选择投递会话'); return; }
  if (!form.prompt.trim()) { message.warning('请输入执行提示词'); return; }
  const isCron = freq.value !== 'custom' || !!form.cronExpr.trim();
  if (freq.value === 'custom' && !form.cronExpr.trim()) { message.warning('请输入 cron 表达式'); return; }
  const payload: Record<string, unknown> = {
    name: form.name.trim(),
    sessionId: form.sessionId,
    agentId: form.agentId || null,
    prompt: form.prompt.trim(),
    scheduleType: isCron ? 'cron' : 'once',
    cronExpr: isCron ? cronPreview.value.expr : null,
    runAt: isCron ? null : form.runAt || null,
  };
  submitting.value = true;
  try {
    if (editingId.value) {
      await updateSchedule(editingId.value, payload);
    } else {
      await createSchedule(payload);
    }
    message.success(editingId.value ? '定时任务已更新' : '定时任务已创建并启用');
    dialogOpen.value = false;
    await load();
  } catch {
    message.error('保存失败（请检查 cron 表达式或会话归属）');
  } finally {
    submitting.value = false;
  }
}

// ===== 动态导入（避免循环依赖仅在此使用）=====
import { createSchedule, updateSchedule } from '../api/schedule';
</script>

<template>
  <div class="flex h-full flex-col">
    <div
      class="flex h-[38px] flex-shrink-0 items-center justify-between border-b border-border bg-background px-3"
    >
      <span class="text-[13px] font-medium">定时任务</span>
      <button
        class="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-primary hover:bg-primary/10"
        @click="openCreate"
      >
        ＋新建任务
      </button>
    </div>

    <div class="min-h-0 flex-1 overflow-auto p-3">
      <div v-if="!schedules.length" class="px-2 py-8 text-center text-[12px] text-muted-foreground">
        <div class="mb-1 text-2xl">⏰</div>
        暂无定时任务
        <div class="mt-1 text-[11px] opacity-70">
          点击「新建任务」配置周期/定点执行；也可在会话中直接对 AI 说"每天早上9点帮我统计…"
        </div>
      </div>

      <div v-else class="space-y-2">
        <div
          v-for="s in schedules"
          :key="s.id"
          class="rounded-lg border border-border bg-card p-3"
        >
          <div class="flex items-center gap-2">
            <span
              class="inline-block h-2 w-2 flex-shrink-0 rounded-full"
              :class="statusMeta(s).dot"
            />
            <span class="min-w-0 flex-1 truncate text-[13px] font-medium">{{ s.name }}</span>
            <span class="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {{ s.scheduleType === 'cron' ? '周期' : '定点' }}
            </span>
          </div>
          <div class="mt-1.5 space-y-0.5 pl-4 text-[11px] text-muted-foreground">
            <div>计划：{{ planText(s) }}</div>
            <div v-if="s.status === 'active' && s.nextRunAt">下次执行：{{ s.nextRunAt?.replace('T', ' ') }}</div>
            <div v-if="s.lastResult" class="truncate" :title="s.lastResult">最近：{{ s.lastResult }}</div>
            <div class="opacity-70">已执行 {{ s.runCount ?? 0 }} 次<span v-if="s.status === 'failed'"> · 连续失败已熔断</span></div>
          </div>
          <div class="mt-2 flex items-center gap-1.5 pl-4">
            <button
              class="rounded border border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
              @click="op(s.id, 'run')"
            >
              ▶ 立即执行
            </button>
            <button
              class="rounded border border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
              @click="op(s.id, s.status === 'active' ? 'pause' : 'resume')"
            >
              {{ s.status === 'active' ? '⏸ 暂停' : '▶ 恢复' }}
            </button>
            <button
              class="rounded border border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
              @click="openEdit(s)"
            >
              编辑
            </button>
            <button
              class="rounded border border-red-500/30 px-2 py-0.5 text-[11px] text-red-500 hover:bg-red-500/10"
              @click="op(s.id, 'delete')"
            >
              删除
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 创建/编辑弹窗 -->
    <a-modal
      v-model:open="dialogOpen"
      :title="editingId ? '编辑定时任务' : '新建定时任务'"
      width="520px"
      :footer="null"
    >
      <div class="space-y-3 py-1">
        <div>
          <label class="mb-1 block text-[12px] text-muted-foreground">任务名称 *</label>
          <input
            v-model="form.name"
            class="h-8 w-full rounded-md border border-border bg-transparent px-2 text-[13px] outline-none focus:border-primary/50"
            placeholder="如：每日销售统计"
          />
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="mb-1 block text-[12px] text-muted-foreground">投递会话 *</label>
            <select
              v-model="form.sessionId"
              class="h-8 w-full rounded-md border border-border bg-transparent px-2 text-[12px] outline-none"
            >
              <option value="" disabled>请选择会话</option>
              <option v-for="sess in sessions" :key="sess.id" :value="sess.id">
                {{ sess.title || '未命名会话' }}
              </option>
            </select>
          </div>
          <div>
            <label class="mb-1 block text-[12px] text-muted-foreground">执行 Agent</label>
            <select
              v-model="form.agentId"
              class="h-8 w-full rounded-md border border-border bg-transparent px-2 text-[12px] outline-none"
            >
              <option value="">自动路由（推荐）</option>
              <option v-for="a in agents" :key="a.id" :value="a.id">{{ a.name }}</option>
            </select>
          </div>
        </div>

        <div>
          <label class="mb-1 block text-[12px] text-muted-foreground">执行提示词 *</label>
          <textarea
            v-model="form.prompt"
            rows="3"
            class="w-full rounded-md border border-border bg-transparent px-2 py-1.5 text-[12px] outline-none focus:border-primary/50"
            placeholder="到点执行时作为用户消息发给 Agent，如：统计演示订单表已支付订单总金额并说明口径"
          />
        </div>

        <div class="rounded-lg border border-border p-3">
          <div class="mb-2 flex items-center gap-3 text-[12px]">
            <label class="flex items-center gap-1">
              <input
                v-model="freq"
                type="radio"
                value="daily"
                class="accent-primary"
              /> 每天
            </label>
            <label class="flex items-center gap-1">
              <input
                v-model="freq"
                type="radio"
                value="weekly"
                class="accent-primary"
              /> 每周
            </label>
            <label class="flex items-center gap-1">
              <input
                v-model="freq"
                type="radio"
                value="monthly"
                class="accent-primary"
              /> 每月
            </label>
            <label class="flex items-center gap-1">
              <input
                v-model="freq"
                type="radio"
                value="once"
                class="accent-primary"
              /> 定点一次
            </label>
            <label class="flex items-center gap-1">
              <input
                v-model="freq"
                type="radio"
                value="custom"
                class="accent-primary"
              /> 自定义 cron
            </label>
          </div>

          <div v-if="freq === 'weekly'" class="mb-2">
            <select
              v-model="weeklyDay"
              class="h-7 w-full rounded-md border border-border bg-transparent px-2 text-[12px] outline-none"
            >
              <option v-for="(label, key) in weekMap2" :key="key" :value="key">{{ label }}</option>
            </select>
          </div>

          <div v-if="freq === 'once'" class="mb-2">
            <input
              v-model="form.runAt"
              type="datetime-local"
              class="h-8 w-full rounded-md border border-border bg-transparent px-2 text-[12px] outline-none"
            />
          </div>

          <div v-if="freq !== 'once'" class="mb-2">
            <input
              v-model="form.time"
              type="time"
              class="h-8 w-full rounded-md border border-border bg-transparent px-2 text-[12px] outline-none"
            />
          </div>

          <div v-if="freq === 'custom'" class="mb-2">
            <input
              v-model="form.cronExpr"
              class="h-8 w-full rounded-md border border-border bg-transparent px-2 font-mono text-[12px] outline-none"
              placeholder="0 0 9 * * ?（秒 分 时 日 月 周）"
            />
          </div>

          <div class="text-[11px] text-muted-foreground">
            <template v-if="freq === 'once'">到点执行一次后任务自动完成</template>
            <template v-else>
              计划：{{ cronPreview.text || '—' }}
              <span v-if="cronPreview.expr" class="ml-1 font-mono opacity-70">{{ cronPreview.expr }}</span>
            </template>
          </div>
        </div>

        <div class="flex justify-end gap-2 pt-1">
          <button
            class="rounded-md border border-border px-3 py-1.5 text-[12px] text-muted-foreground hover:bg-accent"
            @click="dialogOpen = false"
          >
            取消
          </button>
          <button
            class="rounded-md bg-primary px-3 py-1.5 text-[12px] text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            :disabled="submitting"
            @click="submit"
          >
            {{ editingId ? '保存' : '创建' }}
          </button>
        </div>
      </div>
    </a-modal>
  </div>
</template>
