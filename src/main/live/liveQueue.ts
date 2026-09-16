// 为什么需要它：实时对局要在很短时间内为 10 个玩家拉战绩，名单还会随选人、
// 换人、重连变化。无上限并发会把 LCU / SGP 连接打满，反而拖慢所有人；没有
// 取消能力则会把带宽继续花在已经不在场上的玩家身上。
//
// 这个队列提供三件事：
// 1. 并发上限（按 lane 分开计数）
// 2. 优先级（数字小的先跑，让"战绩"这种主内容先出来）
// 3. 按 tag 取消（名单一变，立刻丢弃过期请求）

export class LiveQueueAbortError extends Error {
  constructor(taskId: string) {
    super(`Live queue task aborted: ${taskId}`);
    this.name = 'LiveQueueAbortError';
  }
}

export function isLiveQueueAbortError(error: unknown): boolean {
  return error instanceof LiveQueueAbortError;
}

export type LiveQueueLane = 'match-history' | 'misc';

// 数字越小越先执行。
export const LIVE_PRIORITY = {
  MATCH_HISTORY: 0,
  SUMMONER: 1,
  RANK: 2,
} as const;

export interface LiveQueueAddOptions {
  priority?: number;
  tags?: string[];
}

interface LiveQueueTask {
  id: string;
  lane: LiveQueueLane;
  priority: number;
  tags: string[];
  controller: AbortController;
  run: (signal: AbortSignal) => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
}

const LANES: LiveQueueLane[] = ['match-history', 'misc'];

export class LiveQueue {
  private readonly _pending: LiveQueueTask[] = [];
  private readonly _running = new Map<string, LiveQueueTask>();
  private readonly _aborted = new Set<LiveQueueTask>();
  private readonly _limits: Record<LiveQueueLane, number>;

  constructor(limits: Record<LiveQueueLane, number>) {
    this._limits = limits;
  }

  // 同 id 的任务还在排队或运行中时返回 true。调用方据此避免重复入队。
  hasTask(id: string): boolean {
    return this._running.has(id) || this._pending.some((task) => task.id === id);
  }

  // 入队。返回 null 表示同 id 任务已在队列中（调用方无需再发请求）。
  add<T>(
    lane: LiveQueueLane,
    id: string,
    run: (signal: AbortSignal) => Promise<T>,
    options: LiveQueueAddOptions = {},
  ): Promise<T> | null {
    if (this.hasTask(id)) return null;

    return new Promise<T>((resolve, reject) => {
      this._pending.push({
        id,
        lane,
        priority: options.priority ?? 0,
        tags: options.tags ?? [],
        controller: new AbortController(),
        run: run as (signal: AbortSignal) => Promise<unknown>,
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      this._pump();
    });
  }

  cancelById(id: string): boolean {
    const pendingIndex = this._pending.findIndex((task) => task.id === id);
    if (pendingIndex >= 0) {
      const [task] = this._pending.splice(pendingIndex, 1);
      this._abort(task);
      this._pump();
      return true;
    }

    const running = this._running.get(id);
    if (!running) return false;
    this._abort(running);
    this._pump();
    return true;
  }

  // 按 tag 取消。mode='and' 要求任务带全部 tag，mode='or' 命中任意一个即可。
  // 运行中的任务会立即 reject，同时通过 AbortSignal 中断支持取消的底层请求。
  cancelByTags(tags: string[], mode: 'and' | 'or' = 'and'): void {
    if (tags.length === 0) return;

    const matches = (task: LiveQueueTask) =>
      mode === 'and'
        ? tags.every((tag) => task.tags.includes(tag))
        : tags.some((tag) => task.tags.includes(tag));

    for (let index = this._pending.length - 1; index >= 0; index -= 1) {
      const task = this._pending[index];
      if (!matches(task)) continue;
      this._pending.splice(index, 1);
      this._abort(task);
    }

    for (const task of this._running.values()) {
      if (!matches(task)) continue;
      this._abort(task);
    }
    this._pump();
  }

  // 取消"带该 tag 但不在保留名单里"的任务。名单刷新时用它丢弃已下场的玩家，
  // 同时不误伤仍在场上的请求。
  cancelByTagsNotIn(tag: string, keepTags: string[]): void {
    const keep = new Set(keepTags);
    const matches = (task: LiveQueueTask) =>
      task.tags.includes(tag) && !task.tags.some((value) => value !== tag && keep.has(value));

    for (let index = this._pending.length - 1; index >= 0; index -= 1) {
      const task = this._pending[index];
      if (!matches(task)) continue;
      this._pending.splice(index, 1);
      this._abort(task);
    }

    for (const task of this._running.values()) {
      if (!matches(task)) continue;
      this._abort(task);
    }
    this._pump();
  }

  // 清空队列（应用退出或离开对局时调用）。
  clear(): void {
    for (const task of this._pending) {
      this._abort(task);
    }
    this._pending.length = 0;
    for (const task of this._running.values()) {
      this._abort(task);
    }
  }

  private _abort(task: LiveQueueTask): void {
    if (this._aborted.has(task)) return;
    this._aborted.add(task);
    task.controller.abort();
    task.reject(new LiveQueueAbortError(task.id));
    if (this._running.get(task.id) === task) {
      this._running.delete(task.id);
    }
  }

  private _runningCount(lane: LiveQueueLane): number {
    let count = 0;
    for (const task of this._running.values()) {
      if (task.lane === lane) count += 1;
    }
    return count;
  }

  // 逐 lane 补位：每个 lane 只跑到自己的并发上限。
  private _pump(): void {
    for (const lane of LANES) {
      while (this._runningCount(lane) < this._limits[lane]) {
        const index = this._pickNext(lane);
        if (index < 0) break;
        const [task] = this._pending.splice(index, 1);
        this._start(task);
      }
    }
  }

  // 取该 lane 中优先级最高（数字最小）的待执行任务。
  private _pickNext(lane: LiveQueueLane): number {
    let bestIndex = -1;
    for (let index = 0; index < this._pending.length; index += 1) {
      const task = this._pending[index];
      if (task.lane !== lane) continue;
      if (bestIndex < 0 || task.priority < this._pending[bestIndex].priority) {
        bestIndex = index;
      }
    }
    return bestIndex;
  }

  private _start(task: LiveQueueTask): void {
    this._running.set(task.id, task);

    task
      .run(task.controller.signal)
      .then((value) => {
        // 运行中被取消：必须显式 reject，否则调用方的 promise 永远悬着。
        if (this._aborted.has(task)) {
          task.reject(new LiveQueueAbortError(task.id));
          return;
        }
        task.resolve(value);
      })
      .catch((error) => {
        if (this._aborted.has(task)) {
          task.reject(new LiveQueueAbortError(task.id));
          return;
        }
        task.reject(error);
      })
      .finally(() => {
        this._aborted.delete(task);
        if (this._running.get(task.id) === task) {
          this._running.delete(task.id);
        }
        this._pump();
      });
  }
}
