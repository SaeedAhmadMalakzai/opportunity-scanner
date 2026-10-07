/**
 * Run async tasks with bounded concurrency; stops scheduling new tasks once shouldAbort() is true.
 * Tasks must not throw: wrap each one in its own try/catch (a rejection would abort every worker).
 * @param {Array<() => Promise<void>>} tasks
 * @param {number} concurrency
 * @param {() => boolean} [shouldAbort]
 */
export async function runPool(tasks, concurrency, shouldAbort = () => false) {
  let next = 0;
  const workerCount = Math.max(1, Math.min(concurrency, tasks.length));
  const workers = Array.from({ length: workerCount }, async () => {
    while (next < tasks.length && !shouldAbort()) {
      const task = tasks[next++];
      await task();
    }
  });
  await Promise.all(workers);
}
