import { DebuggerContext } from '../context';

const resolveAuthTag = (): string | undefined => {
  const userId = DebuggerContext.getUserId();
  if (userId === undefined || userId === '') return undefined;
  return `Auth:${userId}`;
};

const appendAuthTag = (tags: string[]): string[] => {
  const authTag = resolveAuthTag();
  if (authTag === undefined || tags.includes(authTag)) return tags;
  return [...tags, authTag];
};

export const AuthTag = Object.freeze({
  append: appendAuthTag,
  resolve: resolveAuthTag,
});

export default AuthTag;
