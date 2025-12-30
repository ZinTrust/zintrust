import { ErrorFactory } from '@exceptions/ZintrustError';

export const validateTemplateMeta = (
  name: string,
  tpl: {
    subject?: string;
    preheader?: string;
    variables?: string[];
    content: string;
  }
): true => {
  if (tpl.subject === null || tpl.subject === undefined || tpl.subject.trim() === '') {
    throw ErrorFactory.createValidationError('Template missing subject', { name });
  }

  const placeholders = new Set<string>();
  const rx = /{{\s*([a-zA-Z0-9_.-]+)\s*}}/g;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(tpl.content)) !== null) {
    placeholders.add(m[1]);
  }

  const metaVars = new Set((tpl.variables ?? []).map((s) => s.trim()).filter(Boolean));

  const missingInContent = Array.from(metaVars).filter((v) => !placeholders.has(v));
  const missingInMeta = Array.from(placeholders).filter((v) => !metaVars.has(v));

  if (missingInContent.length > 0 || missingInMeta.length > 0) {
    throw ErrorFactory.createValidationError('Template variables mismatch', {
      name,
      missingInContent,
      missingInMeta,
    });
  }

  return true;
};

export default { validateTemplateMeta };
