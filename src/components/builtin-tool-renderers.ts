/**
 * T21：内置工具渲染器注册（nl2sql 卡片为首个注册项）。
 * index.ts 已 import 本文件副作用注册。
 */
import SqlResultTable from '../modules/sql-result-table.vue';
import { registerToolRenderer } from './tool-renderers';

registerToolRenderer('local_nl2sql', SqlResultTable);
