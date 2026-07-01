import type {RPA} from '../../../../shared/types/rpa';
import type {ExecutionContext} from './registry';

export type RpaDebugCommand = 'pause' | 'resume' | 'stepOver';

interface Waiter {
  resolve: () => void;
  reject: (error: Error) => void;
}

export interface RpaDebugSnapshot {
  enabled: boolean;
  paused: boolean;
  continuous: boolean;
  currentNodeId?: string;
  currentNodeType?: string;
  lastCommand?: RpaDebugCommand;
}

export class RpaDebugController {
  private readonly enabled: boolean;
  private readonly breakpoints: Set<string>;
  private paused = false;
  private continuous: boolean;
  private stepBudget = 0;
  private pauseRequested = false;
  private waiter: Waiter | null = null;
  private currentNodeId?: string;
  private currentNodeType?: string;
  private lastCommand?: RpaDebugCommand;

  constructor(options: RPA.RunOptions) {
    this.enabled = !!options.debug;
    this.breakpoints = new Set(options.breakpoints ?? []);
    // Debug runs start paused at the first node. Normal runs are continuous but
    // can still be paused by an explicit pause command at the next checkpoint.
    this.continuous = !this.enabled;
  }

  snapshot(): RpaDebugSnapshot {
    return {
      enabled: this.enabled,
      paused: this.paused,
      continuous: this.continuous,
      currentNodeId: this.currentNodeId,
      currentNodeType: this.currentNodeType,
      lastCommand: this.lastCommand,
    };
  }

  pause(): RpaDebugSnapshot {
    this.lastCommand = 'pause';
    this.continuous = false;
    this.stepBudget = 0;
    this.pauseRequested = true;
    return this.snapshot();
  }

  resume(): RpaDebugSnapshot {
    this.lastCommand = 'resume';
    this.continuous = true;
    this.stepBudget = 0;
    this.pauseRequested = false;
    this.releaseWaiter();
    return this.snapshot();
  }

  stepOver(): RpaDebugSnapshot {
    this.lastCommand = 'stepOver';
    this.continuous = false;
    this.pauseRequested = false;
    this.stepBudget = 1;
    this.releaseWaiter();
    return this.snapshot();
  }

  cancel(): void {
    const waiter = this.waiter;
    this.waiter = null;
    waiter?.reject(new Error('Run cancelled'));
  }

  async checkpoint(ctx: ExecutionContext, node: RPA.Node): Promise<void> {
    this.currentNodeId = node.id;
    this.currentNodeType = node.type;

    const shouldPause =
      this.pauseRequested ||
      (this.enabled && this.breakpoints.has(node.id)) ||
      (this.enabled && !this.continuous && this.stepBudget <= 0);

    if (!shouldPause) {
      if (this.stepBudget > 0) this.stepBudget -= 1;
      return;
    }

    this.pauseRequested = false;
    this.paused = true;
    await ctx.log({
      node_id: node.id,
      node_type: node.type,
      status: 'paused',
      message: this.lastCommand === 'pause' ? 'Paused before node' : 'Debug paused before node',
    });

    await this.waitUntilReleased(ctx);

    this.paused = false;
    await ctx.log({
      node_id: node.id,
      node_type: node.type,
      status: 'running',
      message: this.lastCommand === 'stepOver' ? 'Step over' : 'Resumed',
    });

    if (this.stepBudget > 0) this.stepBudget -= 1;
  }

  private waitUntilReleased(ctx: ExecutionContext): Promise<void> {
    if (ctx.token.cancelled || ctx.token.signal.aborted) return Promise.reject(new Error('Run cancelled'));

    return new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        ctx.token.signal.removeEventListener('abort', onAbort);
        this.waiter = null;
        reject(new Error('Run cancelled'));
      };
      this.waiter = {
        resolve: () => {
          ctx.token.signal.removeEventListener('abort', onAbort);
          resolve();
        },
        reject: error => {
          ctx.token.signal.removeEventListener('abort', onAbort);
          reject(error);
        },
      };
      ctx.token.signal.addEventListener('abort', onAbort, {once: true});
    });
  }

  private releaseWaiter(): void {
    const waiter = this.waiter;
    this.waiter = null;
    waiter?.resolve();
  }
}
