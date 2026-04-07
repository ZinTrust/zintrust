type StackFrame = { file: string; line: number };

const FRAME_PREFIX = 'at ';

const parsePositiveInt = (value: string): number | null => {
  if (value === '') return null;

  for (const char of value) {
    if (char < '0' || char > '9') return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
};

const parseFrameLocation = (value: string): StackFrame | null => {
  const columnSeparatorIndex = value.lastIndexOf(':');
  if (columnSeparatorIndex <= 0) return null;

  const lineSeparatorIndex = value.lastIndexOf(':', columnSeparatorIndex - 1);
  if (lineSeparatorIndex <= 0) return null;

  const file = value.slice(0, lineSeparatorIndex).trim();
  const line = parsePositiveInt(value.slice(lineSeparatorIndex + 1, columnSeparatorIndex));
  const column = parsePositiveInt(value.slice(columnSeparatorIndex + 1));

  if (file === '' || line === null || column === null) return null;
  return { file, line };
};

export const parseStackFrameLine = (line: string): StackFrame | null => {
  const trimmed = line.trim();
  if (!trimmed.startsWith(FRAME_PREFIX)) return null;

  const body = trimmed.slice(FRAME_PREFIX.length).trim();
  if (body === '') return null;

  const wrappedStartIndex = body.lastIndexOf(' (');
  if (wrappedStartIndex !== -1 && body.endsWith(')')) {
    return parseFrameLocation(body.slice(wrappedStartIndex + 2, -1));
  }

  return parseFrameLocation(body);
};
