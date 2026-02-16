import { appConfig } from '@/config';
import { Env } from '@config/env';
import { SignedRequest } from '@security/SignedRequest';

const seenStatementIds = new Set<string>();
const MAX_SEEN_STATEMENT_IDS = 50_000;

const rememberStatementId = (statementId: string): boolean => {
  if (seenStatementIds.has(statementId)) return false;
  seenStatementIds.add(statementId);

  // Bound memory growth in long-lived processes.
  if (seenStatementIds.size > MAX_SEEN_STATEMENT_IDS) {
    seenStatementIds.clear();
    seenStatementIds.add(statementId);
  }

  return true;
};

export const SchemaWriter = async (sql: string): Promise<void> => {
  // START LEARNING MODE: If ZT_D1_LEARN_FILE is set, save the statement to JSONL
  const learnFile = Env.get('ZT_D1_LEARN_FILE', '');
  const useSqlWriter = Env.getBool('SQL_WRITER', false);

  if (learnFile === '') return;
  if (!(appConfig.isDevelopment() || useSqlWriter)) return;

  const statementId = await SignedRequest.sha256Hex(sql);
  if (!rememberStatementId(statementId)) return;

  try {
    const fs = (await import('@node-singletons/fs')).fsPromises;
    const line = JSON.stringify({ statementId, sql }) + '\n';
    await fs.appendFile(learnFile, line, 'utf-8');
  } catch {
    // Best effort; ignore errors during learning to avoid crashing app
  }
  // END LEARNING MODE
};

export const StatementRegistryBuild = Object.freeze({
  /**
   * Convert a JSONL capture file into a registry map.
   *
   * Input line shape: { statementId, sql }
   * Output shape: { [statementId]: sql }
   */
  fromJsonl(jsonlText: string): Record<string, string> {
    const out: Record<string, string> = {};
    const lines = jsonlText.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed === '') continue;
      try {
        const parsed = JSON.parse(trimmed) as { statementId?: unknown; sql?: unknown };
        if (typeof parsed.statementId !== 'string' || parsed.statementId.trim() === '') continue;
        if (typeof parsed.sql !== 'string' || parsed.sql.trim() === '') continue;
        out[parsed.statementId] = parsed.sql;
      } catch {
        // Ignore malformed lines
      }
    }
    return out;
  },

  /** Merge registries, with `next` winning on collisions. */
  merge(
    base: Record<string, string> | undefined,
    next: Record<string, string> | undefined
  ): Record<string, string> {
    if (base === undefined) return next ?? {};
    if (next === undefined) return base;
    return { ...base, ...next };
  },

  /** Serialize a registry map as JSON suitable for `ZT_D1_STATEMENTS_JSON`. */
  toStatementsJson(registry: Record<string, string>): string {
    return JSON.stringify(registry);
  },
});
