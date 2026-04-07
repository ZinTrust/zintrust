export const familyHash = (input: string): string => {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index++) {
    hash ^= input.codePointAt(index) ?? 0;
    hash = (hash * 16777619) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
};
