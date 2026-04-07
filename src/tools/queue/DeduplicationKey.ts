export const resolveDeduplicationLockKey = (queueName: string, deduplicationId: string): string => {
  const normalizedQueueName = String(queueName ?? '').trim();
  const normalizedDeduplicationId = String(deduplicationId ?? '').trim();

  if (normalizedQueueName.length === 0) {
    return normalizedDeduplicationId;
  }

  return `queue:${normalizedQueueName}:${normalizedDeduplicationId}`;
};
