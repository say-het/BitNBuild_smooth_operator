export function runInTransaction(database, operation) {
  if (typeof database.$transaction === 'function') {
    return database.$transaction((transaction) => operation(transaction));
  }
  return operation(database);
}
