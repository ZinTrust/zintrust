/**
 * DebuggerDashboard handlers — pure handler functions wired to IDebuggerStorage.
 * No auth in this layer — caller mounts middleware as needed.
 */
import type { IRequest, IResponse } from '@zintrust/core';
import type { EntryTypeValue, IDebuggerStorage } from '../types';

// ---------------------------------------------------------------------------
// Storage holder (set once from routes.ts)
// ---------------------------------------------------------------------------

let _storage: IDebuggerStorage | null = null;

export const setHandlerStorage = (s: IDebuggerStorage): void => {
  _storage = s;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const requireStorage = (res: IResponse): boolean => {
  if (_storage) {
    return true;
  }

  res.setStatus(503).json({ error: 'Debugger not initialised' });
  return false;
};

const getStorage = (res: IResponse): IDebuggerStorage | null => {
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

// ---------------------------------------------------------------------------
// Entry handlers
// ---------------------------------------------------------------------------

export async function listEntries(req: IRequest, res: IResponse): Promise<void> {
  const storage = getStorage(res);
  if (storage !== null) {
    const opts = {
      type: qp(req, 'type') as EntryTypeValue | undefined,
      tag: qp(req, 'tag'),
      batchId: qp(req, 'batchId'),
      from: getNumericQueryParam(req, 'from'),
      to: getNumericQueryParam(req, 'to'),
      page: qpInt(req, 'page', 1),
      perPage: Math.min(qpInt(req, 'perPage', 50), 200),
    };
    try {
      const result = await storage.queryEntries(opts);
      res.json({ ok: true, ...result, page: opts.page, perPage: opts.perPage });
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
