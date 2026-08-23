export * from './types';
export { EffectList, type Disposable } from './effect';
export { PerceptionEventBus } from './events';
export { PerceptionSession } from './kernel';
export { configStore } from './config-store';
export { pagePerception } from './manager';
export { DomCollector } from './collectors/dom-collector';
export { VisibilityController } from './collectors/visibility-collector';
export { watchRoutes, type RouteWatchHandle } from './collectors/route-collector';
export { applyAdaptiveStrategy } from './strategies/adaptive';
export { extractVisibleText, isElementVisible } from './strategies/text';
export { extractTablesFromScope } from './strategies/table';
export { analyzeDomStats, buildInsight, type DomStats } from './strategies/insight';
export {
  ELEMENT_ID_MAIN_CONTENT,
  getMainContentRoot,
  resolveScope,
} from './strategies/scope';
