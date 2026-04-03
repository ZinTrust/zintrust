import { isNonEmptyString } from '@helper/index';

export type RelationBootstrapContext = Readonly<{
  modelTable: string;
  relationName: string;
}>;

export type RelationBootstrapFailure = Readonly<{
  modelTable: string;
  relationName: string;
  source?: string;
  causeMessage: string;
}>;

const contextStack: RelationBootstrapContext[] = [];

const INTERNAL_STACK_MARKERS = [
  'node_modules/@zintrust/core',
  '/src/orm/',
  '/src/config/',
  '/src/exceptions/',
  '/src/helper/',
];

const normalizeStackLine = (line: string): string => line.trim().replace(/^at\s+/, '');

const isInternalFrame = (line: string): boolean => {
  return INTERNAL_STACK_MARKERS.some((marker) => line.includes(marker));
};

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error && isNonEmptyString(error.message)) {
    return error.message;
  }

  return String(error);
};

const getDebugFlagValue = (): unknown => {
  const globalEnv = (globalThis as { env?: Record<string, unknown> }).env;
  const workerValue = globalEnv?.['ZINTRUST_DEBUG_RELATIONS'];
  if (typeof workerValue === 'string') return workerValue;

  if (typeof process !== 'undefined') {
    return process.env?.['ZINTRUST_DEBUG_RELATIONS'];
  }

  return undefined;
};

const toBooleanFlag = (value: unknown): boolean => {
  if (!isNonEmptyString(value)) return false;

  switch (value.trim().toLowerCase()) {
    case '1':
    case 'true':
    case 'yes':
    case 'on':
      return true;
    default:
      return false;
  }
};

const extractSourceFromStack = (stack?: string): string | undefined => {
  if (!isNonEmptyString(stack)) return undefined;

  const frames = stack
    .split('\n')
    .slice(1)
    .map((line) => normalizeStackLine(line))
    .filter((line) => line.length > 0);

  return frames.find((line) => !isInternalFrame(line));
};

export const RelationBootstrapDiagnostics = Object.freeze({
  withContext<T>(context: RelationBootstrapContext, callback: () => T): T {
    contextStack.push(context);
    try {
      return callback();
    } finally {
      contextStack.pop();
    }
  },

  getContext(): RelationBootstrapContext | undefined {
    return contextStack.at(-1);
  },

  isDebugEnabled(): boolean {
    return toBooleanFlag(getDebugFlagValue());
  },

  isDatabaseRegistrationFailure(error: unknown): boolean {
    const message = getErrorMessage(error);
    return (
      message.includes(
        'Relation bootstrap attempted database access before runtime registration'
      ) ||
      (message.includes('Database connection') && message.includes('is not registered'))
    );
  },

  createAccessMessage(connectionName: string, context: RelationBootstrapContext): string {
    return [
      'Relation bootstrap attempted database access before runtime registration.',
      `Model: ${context.modelTable}`,
      `Relation: ${context.relationName}`,
      `Connection: ${connectionName}`,
      'Recommendation: return a lazy relationship object instead of calling query builder methods during Model.define(...).',
    ].join('\n');
  },

  createFailure(
    context: RelationBootstrapContext,
    error: unknown,
    source?: string
  ): RelationBootstrapFailure {
    const resolvedSource =
      source ?? (error instanceof Error ? extractSourceFromStack(error.stack) : undefined);

    return {
      modelTable: context.modelTable,
      relationName: context.relationName,
      source: resolvedSource,
      causeMessage: getErrorMessage(error),
    };
  },

  formatFailureSummary(failures: RelationBootstrapFailure[]): string {
    const lines = [`Model relation bootstrap failures detected: ${failures.length}`];

    for (const failure of failures) {
      const source = failure.source ?? 'unknown';
      lines.push(
        `- Model: ${failure.modelTable} | Relation: ${failure.relationName} | Source: ${source}`
      );
    }

    lines.push(
      'Recommendation: relation methods must stay lazy during Model.define(...); avoid calling where/orderBy/select/query in the relation factory.'
    );

    return lines.join('\n');
  },
});

export default RelationBootstrapDiagnostics;
