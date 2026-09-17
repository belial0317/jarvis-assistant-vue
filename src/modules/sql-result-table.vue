<script setup lang="ts">
/**
 * SQL 查询结果展示组件（T2.8 + T3.9 可视化图表渲染）
 *
 * 功能：
 * - 表格数据渲染（Ant Design Vue Table）
 * - T3.9 图表渲染：根据 chartType 渲染 bar/line/pie（轻量 SVG，无三方图表库依赖）
 * - LLM 结果解读展示
 * - 执行耗时与行数统计
 */
import { computed, ref } from 'vue';

import { Alert, Segmented, Table, Tag, Typography } from 'ant-design-vue';

import type { SqlResultVO } from '../api/nl2sql';

const props = defineProps<{
  result: SqlResultVO;
}>();

const { Paragraph, Text } = Typography;

const tableColumns = computed(() =>
  (props.result.columns || []).map((col) => ({
    title: col,
    dataIndex: col,
    key: col,
    ellipsis: true,
  })),
);

const tableData = computed(() =>
  (props.result.rows || []).map((row, index) => ({ ...row, _rowKey: index })),
);

// ===== T3.9 图表渲染 =====

const viewMode = ref<'chart' | 'table'>(
  props.result.chartType && props.result.chartType !== 'table' ? 'chart' : 'table',
);

const chartType = computed(() => props.result.chartType || 'table');

const canShowChart = computed(
  () => chartType.value !== 'table' && (props.result.rows?.length ?? 0) > 0,
);

// 图表数据提取：第一列作为维度标签，其余数值列作为指标
const chartData = computed(() => {
  const rows = props.result.rows || [];
  const columns = props.result.columns || [];
  if (rows.length === 0 || columns.length === 0) return { labels: [], series: [] };
  const firstCol = columns[0] ?? '';
  const labels = rows.map((r, i) => String(firstCol ? r[firstCol] ?? `#${i + 1}` : `#${i + 1}`));
  const numericCols = columns.slice(1).filter((col) => {
    const val = rows[0]?.[col];
    return val != null && !Number.isNaN(Number(val));
  });
  const series = numericCols.map((col) => ({
    name: col,
    values: rows.map((r) => Number(r[col]) || 0),
  }));
  return { labels, series };
});

// 柱状图 SVG
const barChartSvg = computed(() => {
  const { labels, series } = chartData.value;
  if (labels.length === 0 || series.length === 0) return '';
  const width = 480;
  const height = 200;
  const padding = { top: 16, right: 16, bottom: 32, left: 40 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;
  const allValues = series.flatMap((s) => s.values);
  const maxVal = Math.max(...allValues, 1);
  const barGroupW = chartW / labels.length;
  const barW = Math.min(barGroupW / (series.length + 1), 24);

  let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`;
  // Y 轴刻度
  for (let i = 0; i <= 4; i++) {
    const y = padding.top + (chartH * (4 - i)) / 4;
    const val = (maxVal * i) / 4;
    svg += `<line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="#f0f0f0"/>`;
    svg += `<text x="${padding.left - 4}" y="${y + 4}" font-size="9" fill="#999" text-anchor="end">${val.toFixed(0)}</text>`;
  }
  // 柱子
  const colors = ['#1890ff', '#52c41a', '#faad14', '#f5222d'];
  labels.forEach((label, i) => {
    series.forEach((s, si) => {
      const val = s.values[i] ?? 0;
      const barH = (val / maxVal) * chartH;
      const x = padding.left + i * barGroupW + si * barW + 4;
      const y = padding.top + chartH - barH;
      svg += `<rect x="${x}" y="${y}" width="${barW}" height="${barH}" fill="${colors[si % colors.length]}" rx="2"/>`;
    });
    // X 轴标签
    const lx = padding.left + i * barGroupW + barGroupW / 2;
    svg += `<text x="${lx}" y="${height - padding.bottom + 14}" font-size="9" fill="#666" text-anchor="middle">${label.length > 8 ? label.slice(0, 8) + '…' : label}</text>`;
  });
  svg += '</svg>';
  return svg;
});

// 折线图 SVG
const lineChartSvg = computed(() => {
  const { labels, series } = chartData.value;
  if (labels.length === 0 || series.length === 0) return '';
  const width = 480;
  const height = 200;
  const padding = { top: 16, right: 16, bottom: 32, left: 40 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;
  const allValues = series.flatMap((s) => s.values);
  const maxVal = Math.max(...allValues, 1);
  const stepX = labels.length > 1 ? chartW / (labels.length - 1) : 0;

  let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`;
  for (let i = 0; i <= 4; i++) {
    const y = padding.top + (chartH * (4 - i)) / 4;
    const val = (maxVal * i) / 4;
    svg += `<line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="#f0f0f0"/>`;
    svg += `<text x="${padding.left - 4}" y="${y + 4}" font-size="9" fill="#999" text-anchor="end">${val.toFixed(0)}</text>`;
  }
  const colors = ['#1890ff', '#52c41a', '#faad14', '#f5222d'];
  series.forEach((s, si) => {
    const points = s.values
      .map((v, i) => {
        const x = padding.left + i * stepX;
        const y = padding.top + chartH - (v / maxVal) * chartH;
        return `${x},${y}`;
      })
      .join(' ');
    svg += `<polyline points="${points}" fill="none" stroke="${colors[si % colors.length]}" stroke-width="2"/>`;
    s.values.forEach((v, i) => {
      const x = padding.left + i * stepX;
      const y = padding.top + chartH - (v / maxVal) * chartH;
      svg += `<circle cx="${x}" cy="${y}" r="3" fill="${colors[si % colors.length]}"/>`;
    });
  });
  labels.forEach((label, i) => {
    const lx = padding.left + i * stepX;
    svg += `<text x="${lx}" y="${height - padding.bottom + 14}" font-size="9" fill="#666" text-anchor="middle">${label.length > 8 ? label.slice(0, 8) + '…' : label}</text>`;
  });
  svg += '</svg>';
  return svg;
});

// 饼图（conic-gradient）
const pieChartStyle = computed(() => {
  const { labels, series } = chartData.value;
  if (labels.length === 0 || series.length === 0) return '';
  const values = series[0]?.values || [];
  const total = values.reduce((a, b) => a + Math.abs(b), 0) || 1;
  const colors = ['#1890ff', '#52c41a', '#faad14', '#f5222d', '#722ed1', '#13c2c2'];
  let acc = 0;
  const stops = values
    .map((v, i) => {
      const pct = (Math.abs(v) / total) * 100;
      const start = acc;
      acc += pct;
      return `${colors[i % colors.length]} ${start}% ${acc}%`;
    })
    .join(', ');
  return `background: conic-gradient(${stops})`;
});

const pieLabels = computed(() => {
  const { labels, series } = chartData.value;
  const values = series[0]?.values || [];
  const total = values.reduce((a, b) => a + Math.abs(b), 0) || 1;
  const colors = ['#1890ff', '#52c41a', '#faad14', '#f5222d', '#722ed1', '#13c2c2'];
  return labels.map((label, i) => ({
    label,
    value: values[i] ?? 0,
    pct: ((Math.abs(values[i] ?? 0) / total) * 100).toFixed(1),
    color: colors[i % colors.length],
  }));
});
</script>

<template>
  <div class="sql-result-table">
    <div class="mb-2 flex items-center gap-2">
      <Tag color="green">查询成功</Tag>
      <Text type="secondary">{{ result.rowCount }} 行</Text>
      <Text type="secondary">·</Text>
      <Text type="secondary">{{ result.elapsedMs }}ms</Text>
      <Tag v-if="chartType !== 'table'" color="blue" class="ml-1">
        推荐: {{ chartType }}
      </Tag>
    </div>

    <!-- T3.9 图表/表格切换 -->
    <Segmented
      v-if="canShowChart"
      v-model:value="viewMode"
      :options="[
        { label: '图表', value: 'chart' },
        { label: '表格', value: 'table' },
      ]"
      size="small"
      class="mb-3"
    />

    <!-- 图表视图 -->
    <div v-if="viewMode === 'chart' && canShowChart" class="chart-container">
      <!-- 柱状图 -->
      <div v-if="chartType === 'bar'" class="chart-svg" v-html="barChartSvg" />
      <!-- 折线图 -->
      <div v-else-if="chartType === 'line'" class="chart-svg" v-html="lineChartSvg" />
      <!-- 饼图 -->
      <div v-else-if="chartType === 'pie'" class="pie-wrapper">
        <div class="pie-chart" :style="pieChartStyle" />
        <div class="pie-legend">
          <div v-for="item in pieLabels" :key="item.label" class="pie-legend-item">
            <span class="pie-dot" :style="{ background: item.color }" />
            <Text class="pie-label-text">{{ item.label }}</Text>
            <Text type="secondary" class="pie-pct">{{ item.pct }}%</Text>
          </div>
        </div>
      </div>
    </div>

    <!-- 表格视图 -->
    <Table
      v-show="viewMode === 'table' || !canShowChart"
      :columns="tableColumns"
      :data-source="tableData"
      :pagination="result.rowCount > 10 ? { pageSize: 10, size: 'small' } : false"
      :scroll="{ x: 'max-content', y: 400 }"
      size="small"
      row-key="_rowKey"
      bordered
    />

    <Alert
      v-if="result.interpretation"
      class="mt-3"
      type="info"
      show-icon
      message="数据解读"
    >
      <template #description>
        <Paragraph>{{ result.interpretation }}</Paragraph>
      </template>
    </Alert>
  </div>
</template>

<style scoped>
.sql-result-table {
  width: 100%;
}

.mb-2 {
  margin-bottom: 8px;
}

.mb-3 {
  margin-bottom: 12px;
}

.mt-3 {
  margin-top: 12px;
}

.ml-1 {
  margin-left: 4px;
}

.chart-container {
  padding: 8px;
  background: #fafafa;
  border-radius: 4px;
  margin-bottom: 12px;
}

.chart-svg {
  display: flex;
  justify-content: center;
}

.chart-svg :deep(svg) {
  max-width: 100%;
  height: auto;
}

.pie-wrapper {
  display: flex;
  gap: 16px;
  align-items: center;
  justify-content: center;
  padding: 12px;
}

.pie-chart {
  width: 160px;
  height: 160px;
  border-radius: 50%;
  flex-shrink: 0;
}

.pie-legend {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 160px;
  overflow-y: auto;
}

.pie-legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}

.pie-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 2px;
  flex-shrink: 0;
}

.pie-label-text {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pie-pct {
  font-size: 11px;
}
</style>