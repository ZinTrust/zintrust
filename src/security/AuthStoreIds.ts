import { generateUuid } from '@common/utility';

const getErrorMessage = (error: unknown): string => {
  return error instanceof Error ? error.message : String(error);
};

const includesIdDefaultFailure = (message: string): boolean => {
  return (
    message.includes("field 'id' doesn't have a default value") ||
    message.includes("field `id` doesn't have a default value") ||
    message.includes('column "id" does not have a default value') ||
    message.includes('column "id" cannot be null') ||
    message.includes('null value in column "id" violates not-null constraint') ||
    message.includes("cannot insert the value null into column 'id'") ||
    message.includes('not null constraint failed') ||
    message.includes('missing a default value for column')
  );
};

export const shouldRetryAuthStoreInsertWithGeneratedId = (error: unknown): boolean => {
  const message = getErrorMessage(error).toLowerCase();
  return message.includes('id') && includesIdDefaultFailure(message);
};

export const withGeneratedAuthStoreId = (
  payload: Record<string, unknown>
): Record<string, unknown> => {
  if (Object.prototype.hasOwnProperty.call(payload, 'id')) {
    return payload;
  }

  return {
    id: generateUuid(),
    ...payload,
  };
};

export default Object.freeze({
  shouldRetryAuthStoreInsertWithGeneratedId,
  withGeneratedAuthStoreId,
});
