/**
 * Phase 4.3 — Concurrency-limited task queue.
 *
 * Runs an array of async task factories with at most `maxConcurrent` in flight
 * at once. Each task's settled result (fulfilled or rejected) is reported via
 * the optional `onProgress` callback so callers can stream progress to the UI.
 *
 * Never rejects: individual task errors are captured into the returned results
 * so one failing profile does not abort the whole batch.
 */

export interface TaskResult<T> {
  index: number;
  success: boolean;
  value?: T;
  error?: string;
}

export interface ProgressInfo<T> {
  completed: number;
  total: number;
  result: TaskResult<T>;
}

export async function runWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  maxConcurrent = 5,
  onProgress?: (info: ProgressInfo<T>) => void,
): Promise<TaskResult<T>[]> {
  const total = tasks.length;
  const results: TaskResult<T>[] = new Array(total);
  const limit = Math.max(1, Math.min(maxConcurrent, total || 1));
  let cursor = 0;
  let completed = 0;

  const worker = async (): Promise<void> => {
    while (cursor < total) {
      const index = cursor++;
      let result: TaskResult<T>;
      try {
        const value = await tasks[index]();
        result = {index, success: true, value};
      } catch (error) {
        result = {index, success: false, error: String(error)};
      }
      results[index] = result;
      completed++;
      onProgress?.({completed, total, result});
    }
  };

  const workers = Array.from({length: limit}, () => worker());
  await Promise.all(workers);
  return results;
}
