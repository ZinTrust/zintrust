export const extractMajorMinorVersion = (
  value: string
): { major: string; minor: string } | undefined => {
  const trimmed = value.trim();
  let start = -1;

  for (let index = 0; index < trimmed.length; index++) {
    const char = trimmed[index];
    if (char !== undefined && char >= '0' && char <= '9') {
      start = index;
      break;
    }
  }

  if (start < 0) return undefined;

  let end = start;
  while (end < trimmed.length) {
    const char = trimmed[end];
    const isDigit = char !== undefined && char >= '0' && char <= '9';
    if (!isDigit && char !== '.') break;
    end++;
  }

  const parts = trimmed.slice(start, end).split('.');
  if (parts.length < 3) return undefined;

  const [major, minor, patch] = parts;
  if (!major || !minor || !patch) return undefined;

  return { major, minor };
};

export const PINNED_GOVERNANCE_SCAFFOLDER_VERSION = '^1.2.0';

export const toCompatibleGovernanceVersion = (value: string, fallback = '^1.0.0'): string => {
  const parsed = extractMajorMinorVersion(value);
  if (parsed === undefined) return fallback;

  return `^${parsed.major}.${parsed.minor}.2`;
};
