/**
 * AI 助手 API：知识库模块
 */
import type {
  DocumentSegment,
  KnowledgeBase,
  KnowledgeDocument,
  RetrievalResult,
} from '../types';

import { aiRequestClient } from './client';
import { KnowledgeApi, path } from './endpoints';

export type KnowledgeBaseVO = KnowledgeBase;
export type KnowledgeDocumentVO = KnowledgeDocument;
export type RetrievalResultVO = RetrievalResult;
export type DocumentSegmentVO = DocumentSegment;

export interface KnowledgeQueryDTO {
  keyword?: string;
  status?: string;
  pageNum?: number;
  pageSize?: number;
}

export interface KnowledgeBaseSaveDTO {
  id?: string;
  name: string;
  description?: string;
  indexTechnique?: 'high_quality' | 'economy';
  embeddingModelId?: string;
  embeddingModelProvider?: string;
  /** UI 层用对象；发送前由下方 API 序列化为 JSON 字符串（后端 DTO 契约为 String） */
  chunkConfig?: any;
  retrievalModel?: any;
}

/**
 * 后端契约适配：KnowledgeBaseEntity/VO/DTO 三层的 chunkConfig 与 retrievalModel
 * 均为 JSON 字符串（E2E 实测 2026-09-03：对象直发触发 MismatchedInputException）。
 * 本层是契约边界——提交时 stringify，回显时 parse + 表单默认值兜底。
 */
function parseJsonField<T>(raw: unknown): T | undefined {
  if (raw == null) return undefined;
  if (typeof raw === 'object') return raw as T;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      return JSON.parse(raw) as T;
    } catch {
      console.warn('[knowledge] chunkConfig/retrievalModel 非法 JSON，使用表单默认值');
      return undefined;
    }
  }
  return undefined;
}

/** 字符串 VO → 前端对象模型（缺省字段回落表单默认值，编辑回显不空白） */
function toKnowledgeBase(raw: any): KnowledgeBase {
  return {
    ...raw,
    chunkConfig: parseJsonField(raw?.chunkConfig) ?? {
      structure: 'text',
      separator: '\\n',
      maxTokens: 512,
      chunkOverlap: 64,
      preProcessingRules: [
        { id: 'remove_extra_spaces', enabled: true },
        { id: 'remove_urls_emails', enabled: false },
      ],
    },
    retrievalModel: parseJsonField(raw?.retrievalModel) ?? {
      searchMethod: 'hybrid',
      rerankingEnable: false,
      topK: 4,
      scoreThresholdEnabled: false,
    },
  };
}

export function listKnowledgeBases(params?: KnowledgeQueryDTO) {
  return aiRequestClient
    .get<any[]>(KnowledgeApi.BASES, { params })
    .then((list) => list.map(toKnowledgeBase));
}

export function getKnowledgeBase(id: string) {
  return aiRequestClient
    .get<any>(path(KnowledgeApi.BASE_DETAIL, { id }))
    .then(toKnowledgeBase);
}

export function saveKnowledgeBase(dto: KnowledgeBaseSaveDTO) {
  const payload = {
    ...dto,
    chunkConfig: dto.chunkConfig == null ? undefined : JSON.stringify(dto.chunkConfig),
    retrievalModel: dto.retrievalModel == null ? undefined : JSON.stringify(dto.retrievalModel),
  };
  return aiRequestClient.post<string>(KnowledgeApi.BASE_SAVE, payload);
}

export function deleteKnowledgeBase(id: string) {
  return aiRequestClient.delete(path(KnowledgeApi.BASE_DELETE, { id }));
}

/** 检索测试 */
export function retrieve(kbId: string, query: string, topK = 5) {
  return aiRequestClient.get<RetrievalResultVO[]>(
    path(KnowledgeApi.RETRIEVE, { kbId }),
    { params: { query, topK } },
  );
}

export function listDocuments(kbId: string) {
  return aiRequestClient.get<KnowledgeDocumentVO[]>(
    path(KnowledgeApi.DOCUMENTS, { kbId }),
  );
}

export function uploadDocument(kbId: string, file: File, signal?: AbortSignal) {
  const formData = new FormData();
  formData.append('file', file);
  return aiRequestClient.post<string>(
    path(KnowledgeApi.DOCUMENTS, { kbId }),
    formData,
    {
      // 覆盖默认的 application/json，让浏览器自动设置 multipart/form-data + boundary
      headers: { 'Content-Type': 'multipart/form-data' },
      signal,
    },
  );
}

export function deleteDocument(id: string) {
  return aiRequestClient.delete(path(KnowledgeApi.DOC_DELETE, { id }));
}

export function reindexDocument(id: string) {
  return aiRequestClient.post(path(KnowledgeApi.DOC_REINDEX, { id }));
}

/** 文档分段列表 */
export function listDocumentSegments(docId: string) {
  return aiRequestClient.get<DocumentSegmentVO[]>(
    path(KnowledgeApi.DOC_SEGMENTS, { id: docId }),
  );
}
