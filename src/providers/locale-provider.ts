/**
 * 国际化提供者抽象
 *
 * AI 助手本身不做 i18n，仅将语言代码传给后端，
 * 由后端返回对应语言的错误提示。
 */

export interface LocaleProvider {
  /** 返回当前语言代码，如 'zh-CN'、'en-US' */
  getLocale(): string;
}
