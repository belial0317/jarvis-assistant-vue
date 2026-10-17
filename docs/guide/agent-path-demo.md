# 智能体路径诊断器 · T0 交互原型

<script setup>
import AgentTraceDemo from '../../src/components/agent-trace/AgentTraceDemo.vue';
</script>

本页面是任务包 `docs/memory/tasks-2609-2316-45` T0 可行性验证的原型演示（mock 数据，只读）。

验证点：点击节点/请求边/返回边联动右侧详情；同名并行 callKey 分组不串线；仅观测到实际返回才画返回箭头；denied/not_observed 状态不被画成完成；缩放平移可用。

<AgentTraceDemo />