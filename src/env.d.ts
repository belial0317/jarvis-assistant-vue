/**
 * 构建期注入的 SDK 版本信息（vite.config.ts define）。
 * 代码中一律经 typeof 守卫读取（防测试/宿主环境未注入时 ReferenceError）。
 */
declare const __SDK_VERSION__: string;
declare const __SDK_PACKAGE__: string;
declare const __SDK_CHANNEL__: 'oss' | 'commercial';
