/**
 * TraceDashboard handlers — pure handler functions wired to ITraceStorage.
 * No auth in this layer — caller mounts middleware as needed.
 */
import type { IRequest, IResponse } from '@zintrust/core';
import type { EntryTypeValue, ITraceEntry, ITraceStorage } from '../types';

// ---------------------------------------------------------------------------
// Storage holder (set once from routes.ts)
// ---------------------------------------------------------------------------

let _storage: ITraceStorage | null = null;

export const setHandlerStorage = (s: ITraceStorage): void => {
  _storage = s;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const requireStorage = (res: IResponse): boolean => {
  if (_storage) {
    return true;
  }

  res.setStatus(503).json({ error: 'Trace not initialised' });
  return false;
};

const getStorage = (res: IResponse): ITraceStorage | null => {
  if (requireStorage(res)) {
    return _storage;
  }

  return null;
};

const qp = (req: IRequest, key: string): string | undefined => {
  const v = req.getQueryParam(key);
  return Array.isArray(v) ? v[0] : v;
};

const qpInt = (req: IRequest, key: string, fallback: number): number => {
  const raw = qp(req, key);
  const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isNaN(n) ? fallback : n;
};

const getNumericQueryParam = (req: IRequest, key: string): number | undefined => {
  const raw = qp(req, key);
  if (typeof raw === 'string') {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
};

const DEFAULT_PER_PAGE = 50;
const MAX_PER_PAGE = 100;
const DEFAULT_REQUEST_PER_PAGE = 25;
const MAX_REQUEST_PER_PAGE = 50;
const SUMMARY_TEXT_LIMIT = 280;
const SUMMARY_ARRAY_LIMIT = 10;

type CompactTraceEntry = ITraceEntry<Record<string, unknown>> & {
  hasDetails: true;
  contentBytes?: number;
};

const truncateText = (value: string, limit = SUMMARY_TEXT_LIMIT): string =>
  value.length <= limit ? value : `${value.slice(0, Math.max(0, limit - 3))}...`;

const compactValue = (value: unknown): unknown => {
  if (typeof value === 'string') {
    return truncateText(value);
  }

  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value === null ||
    value === undefined
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, SUMMARY_ARRAY_LIMIT).map((item) => {
      if (typeof item === 'string') {
        return truncateText(item);
      }

      if (typeof item === 'number' || typeof item === 'boolean' || item === null) {
        return item;
      }

      return '[complex]';
    });
  }

  return undefined;
};

const pickCompactContent = (content: unknown, keys: readonly string[]): Record<string, unknown> => {
  if (typeof content !== 'object' || content === null || Array.isArray(content)) {
    return {};
  }

  const source = content as Record<string, unknown>;
  const compact: Record<string, unknown> = {};

  for (const key of keys) {
    const value = compactValue(source[key]);
    if (value !== undefined) {
      compact[key] = value;
    }
  }

  return compact;
};

const COMPACT_ENTRY_KEYS: Record<EntryTypeValue, readonly string[]> = {
  request: [
    'method',
    'uri',
    'responseStatus',
    'duration',
    'memory',
    'middleware',
    'hostname',
    'userId',
  ],
  query: ['connection', 'sql', 'time', 'duration', 'slow', 'hash', 'hostname'],
  exception: ['class', 'file', 'line', 'message', 'occurrences', 'hostname', 'userId'],
  log: ['level', 'message', 'hostname'],
  job: ['status', 'connection', 'queue', 'name', 'tries', 'timeout', 'hostname'],
  cache: ['operation', 'key', 'hit', 'store', 'payloadLogged', 'ttl', 'duration', 'hostname'],
  schedule: ['name', 'expression', 'status', 'duration', 'hostname'],
  mail: ['to', 'subject', 'template', 'hostname'],
  auth: ['event', 'userId', 'hostname'],
  event: ['name', 'listenerCount', 'hostname'],
  model: ['action', 'model', 'id', 'hostname'],
  notification: ['channels', 'notifiable', 'notification', 'message', 'hostname'],
  redis: ['command', 'duration', 'hostname'],
  gate: ['ability', 'result', 'userId', 'subject', 'hostname'],
  middleware: ['name', 'event', 'duration', 'hostname'],
  command: ['name', 'exitCode', 'duration', 'hostname'],
  batch: ['name', 'total', 'processed', 'failed', 'status', 'hostname'],
  dump: ['file', 'line', 'hostname'],
  view: ['template', 'duration', 'hostname'],
  client_request: ['source', 'method', 'url', 'responseStatus', 'error', 'duration', 'hostname'],
};

const compactEntryContent = (entry: ITraceEntry): Record<string, unknown> =>
  pickCompactContent(entry.content, COMPACT_ENTRY_KEYS[entry.type]);

const estimateContentBytes = (content: unknown): number | undefined => {
  try {
    return new TextEncoder().encode(JSON.stringify(content)).length;
  } catch {
    return undefined;
  }
};

const compactListEntry = (entry: ITraceEntry): CompactTraceEntry => ({
  ...entry,
  content: compactEntryContent(entry),
  hasDetails: true,
  contentBytes: estimateContentBytes(entry.content),
});

const resolvePerPage = (req: IRequest, type?: EntryTypeValue): number => {
  const isRequestList = type === 'request';
  const fallback = isRequestList ? DEFAULT_REQUEST_PER_PAGE : DEFAULT_PER_PAGE;
  const limit = isRequestList ? MAX_REQUEST_PER_PAGE : MAX_PER_PAGE;

  return Math.max(1, Math.min(qpInt(req, 'perPage', fallback), limit));
};

// ---------------------------------------------------------------------------
// Entry handlers
// ---------------------------------------------------------------------------

export async function listEntries(req: IRequest, res: IResponse): Promise<void> {
  const storage = getStorage(res);
  if (storage !== null) {
    const type = qp(req, 'type') as EntryTypeValue | undefined;
    const opts = {
      type,
      tag: qp(req, 'tag'),
      batchId: qp(req, 'batchId'),
      from: getNumericQueryParam(req, 'from'),
      to: getNumericQueryParam(req, 'to'),
      page: Math.max(1, qpInt(req, 'page', 1)),
      perPage: resolvePerPage(req, type),
    };
    try {
      const result = await storage.queryEntries(opts);
      res.json({
        ok: true,
        data: result.data.map(compactListEntry),
        total: result.total,
        page: opts.page,
        perPage: opts.perPage,
      });
    } catch (err) {
      res.setStatus(500).json({ error: (err as Error).message });
    }
  }
}

export async function getEntry(req: IRequest, res: IResponse): Promise<void> {
  const storage = getStorage(res);
  if (storage === null) return;
  const uuid = req.getParam('uuid');
  if (uuid) {
    try {
      const entry = await storage.getEntry(uuid);
      if (entry) {
        res.json({ ok: true, entry });
        return;
      }

      res.setStatus(404).json({ error: 'Not found' });
      return;
    } catch (err) {
      res.setStatus(500).json({ error: (err as Error).message });
      return;
    }
  }

  res.setStatus(400).json({ error: 'uuid required' });
}

export async function getBatch(req: IRequest, res: IResponse): Promise<void> {
  const storage = getStorage(res);
  if (storage === null) return;
  const batchId = req.getParam('batchId');
  if (batchId) {
    try {
      const entries = await storage.getBatch(batchId);
      res.json({ ok: true, entries });
      return;
    } catch (err) {
      res.setStatus(500).json({ error: (err as Error).message });
      return;
    }
  }

  res.setStatus(400).json({ error: 'batchId required' });
}

export async function getStats(_req: IRequest, res: IResponse): Promise<void> {
  const storage = getStorage(res);
  if (storage === null) return;
  try {
    const stats = await storage.stats();
    res.json({ ok: true, stats });
  } catch (err) {
    res.setStatus(500).json({ error: (err as Error).message });
  }
}

export async function clearEntries(_req: IRequest, res: IResponse): Promise<void> {
  const storage = getStorage(res);
  if (storage === null) return;
  try {
    await storage.clear();
    res.json({ ok: true });
  } catch (err) {
    res.setStatus(500).json({ error: (err as Error).message });
  }
}

// ---------------------------------------------------------------------------
// Monitoring handlers
// ---------------------------------------------------------------------------

export async function getMonitoring(_req: IRequest, res: IResponse): Promise<void> {
  const storage = getStorage(res);
  if (storage === null) return;
  try {
    const tags = await storage.getMonitoring();
    res.json({ ok: true, tags });
  } catch (err) {
    res.setStatus(500).json({ error: (err as Error).message });
  }
}

export async function addMonitoring(req: IRequest, res: IResponse): Promise<void> {
  const storage = getStorage(res);
  if (storage === null) return;
  const tag = req.getParam('tag');
  if (tag) {
    try {
      await storage.addMonitoring(tag);
      res.json({ ok: true });
      return;
    } catch (err) {
      res.setStatus(500).json({ error: (err as Error).message });
      return;
    }
  }

  res.setStatus(400).json({ error: 'tag required' });
}

export async function removeMonitoring(req: IRequest, res: IResponse): Promise<void> {
  const storage = getStorage(res);
  if (storage === null) return;
  const tag = req.getParam('tag');
  if (tag) {
    try {
      await storage.removeMonitoring(tag);
      res.json({ ok: true });
      return;
    } catch (err) {
      res.setStatus(500).json({ error: (err as Error).message });
      return;
    }
  }

  res.setStatus(400).json({ error: 'tag required' });
}
