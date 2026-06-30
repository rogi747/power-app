export class RpaCancellationToken {
  private readonly controller = new AbortController();
  cancelled = false;

  get signal(): AbortSignal {
    return this.controller.signal;
  }

  cancel(): void {
    if (this.cancelled) return;
    this.cancelled = true;
    this.controller.abort(new Error('Run cancelled'));
  }

  throwIfCancelled(): void {
    if (this.cancelled || this.signal.aborted) {
      throw new Error('Run cancelled');
    }
  }
}

export const cancellableDelay = (ms: number, token: RpaCancellationToken): Promise<void> => {
  token.throwIfCancelled();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      token.signal.removeEventListener('abort', onAbort);
      resolve();
    }, Math.max(0, ms));

    const onAbort = () => {
      clearTimeout(timeout);
      reject(new Error('Run cancelled'));
    };

    token.signal.addEventListener('abort', onAbort, {once: true});
  });
};
