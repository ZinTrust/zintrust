export const isMutatingSql = (sql: string): boolean => {
  const s = sql.trimStart().toLowerCase();
  return (
    s.startsWith('insert') ||
    s.startsWith('update') ||
    s.startsWith('delete') ||
    s.startsWith('merge') ||
    s.startsWith('create') ||
    s.startsWith('drop') ||
    s.startsWith('alter') ||
    s.startsWith('replace') ||
    s.startsWith('truncate')
  );
};
