/**
 * T19：新手引导状态管理（任务门控式——步骤推进检测实体真实变化）。
 *
 * 门控数据源：
 *   step0→1 会话数增加；step1→2 Agent 数增加（或已选 Agent）；
 *   step2→3 消息数增加；step3 完成→出现已裁决审批。
 * 首次进入（无 localStorage 标记）自动触发；设置页可重放（resetTour）。
 */
import { computed, reactive, watch } from 'vue';

const STORAGE_KEY = 'ai_assistant_tour_done';

export interface TourStepDef {
  id: number;
  title: string;
  description: string;
  /** 目标元素选择器（高亮定位） */
  target: string;
}

export const TOUR_STEPS: TourStepDef[] = [
  { id: 0, title: '新建会话', description: '点击「新建会话」开始一段对话', target: 'button' },
  { id: 1, title: '选择 Agent', description: '通过工具栏的 Agent 选择器切换不同智能体', target: 'button' },
  { id: 2, title: '发送消息', description: '输入问题并回车发送，AI 将流式回答', target: 'textarea' },
  { id: 3, title: '完成审批', description: '当 AI 请求执行工具时，在授权卡中做出裁决', target: '[class*="amber"]' },
];

const state = reactive({
  active: false,
  step: 0,
  baseline: { sessions: 0, messages: 0 },
});

export function isTourDone(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return true;
  }
}

export function markTourDone(): void {
  try {
    localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    // 忽略
  }
  state.active = false;
}

/** 首次进入自动触发 */
export function maybeStartTour(): void {
  if (!isTourDone()) {
    state.active = true;
    state.step = 0;
  }
}

/** 手动重放 */
export function resetTour(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 忽略
  }
  state.active = true;
  state.step = 0;
}

/** 记录基线（引导开始时的实体数量，用于门控比较） */
export function setBaseline(sessions: number, messages: number): void {
  state.baseline.sessions = sessions;
  state.baseline.messages = messages;
}

/**
 * 门控推进：调用方在数据变化时调用；返回 true=发生了推进。
 * step0 会话数 > baseline；step2 消息数 > baseline；step3 由审批完成事件显式推进。
 */
export function advanceIfSatisfied(cur: { sessions: number; messages: number; approvalResolved: boolean }): boolean {
  if (!state.active) return false;
  const s = state.step;
  if (s === 0 && cur.sessions > state.baseline.sessions) {
    state.step = 1;
    return true;
  }
  if (s === 1 && (cur.sessions > state.baseline.sessions || cur.messages > state.baseline.messages)) {
    state.step = 2;
    return true;
  }
  if (s === 2 && cur.messages > state.baseline.messages + 0) {
    state.step = 3;
    return true;
  }
  if (s === 3 && cur.approvalResolved) {
    markTourDone();
    state.step = 4;
    return true;
  }
  return false;
}

export const tourState = state;

export const tourActive = computed(() => state.active);
