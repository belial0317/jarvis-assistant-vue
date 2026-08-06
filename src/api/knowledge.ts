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
  chunkConfig?: any;
  retrievalModel?: any;
}

export function listKnowledgeBases(params?: KnowledgeQueryDTO) {
  return aiRequestClient.get<KnowledgeBaseVO[]>(KnowledgeApi.BASES, { params });
}

export function getKnowledgeBase(id: string) {
  return aiRequestClient.get<KnowledgeBaseVO>(
    path(KnowledgeApi.BASE_DETAIL, { id }),
  );
}

export function saveKnowledgeBase(dto: KnowledgeBaseSaveDTO) {
  return aiRequestClient.post<string>(KnowledgeApi.BASE_SAVE, dto);
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

export function uploadDocument(kbId: string, file: File) {
  const formData = new FormData();
  formData.append('file', file);
  return aiRequestClient.post<string>(
    path(KnowledgeApi.DOCUMENTS, { kbId }),
    formData,
    {
      // 覆盖默认的 application/json，让浏览器自动设置 multipart/form-data + boundary
      headers: { 'Content-Type': 'multipart/form-data' },
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
