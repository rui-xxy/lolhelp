import { describe, expect, it } from 'vitest';
import { LiveQueue, LiveQueueAbortError, isLiveQueueAbortError } from './liveQueue';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('LiveQueue', () => {
  it('同 id 任务不会重复入队', () => {
    const queue = new LiveQueue({ 'match-history': 2, misc: 2 });
    const first = queue.add('match-history', 'a', () => Promise.resolve(1));
    const second = queue.add('match-history', 'a', () => Promise.resolve(2));

    expect(first).not.toBeNull();
    expect(second).toBeNull();
  });

  it('遵守每个 lane 的并发上限', async () => {
    const queue = new LiveQueue({ 'match-history': 2, misc: 4 });
    let running = 0;
    let peak = 0;
    const gates = Array.from({ length: 6 }, () => deferred<void>());

    const tasks = gates.map((gate, index) =>
      queue.add('match-history', `task-${index}`, async () => {
        running += 1;
        peak = Math.max(peak, running);
        await gate.promise;
        running -= 1;
        return index;
      }),
    );

    // 让已入队的任务有机会启动。
    await Promise.resolve();
    expect(peak).toBeLessThanOrEqual(2);

    gates.forEach((gate) => gate.resolve());
    await Promise.all(tasks.filter(Boolean));
    expect(peak).toBe(2);
  });

  it('按优先级从高到低执行', async () => {
    const queue = new LiveQueue({ 'match-history': 1, misc: 1 });
    const order: string[] = [];
    const gate = deferred<void>();

    // 先占住唯一一个 slot，让后续任务全部排队。
    const blocker = queue.add('match-history', 'blocker', async () => {
      await gate.promise;
      return 'blocker';
    });
    await Promise.resolve();

    const low = queue.add('match-history', 'low', async () => {
      order.push('low');
      return 'low';
    }, { priority: 10 });
    const high = queue.add('match-history', 'high', async () => {
      order.push('high');
      return 'high';
    }, { priority: 1 });

    gate.resolve();
    await Promise.all([blocker, low, high]);

    expect(order).toEqual(['high', 'low']);
  });

  it('cancelByTags 会拒绝排队中的任务', async () => {
    const queue = new LiveQueue({ 'match-history': 1, misc: 1 });
    const gate = deferred<void>();

    const blocker = queue.add('match-history', 'blocker', async () => {
      await gate.promise;
      return 'blocker';
    });
    await Promise.resolve();

    const pending = queue.add('match-history', 'pending', async () => 'pending', {
      tags: ['puuid-a', 'match-history'],
    });

    queue.cancelByTags(['puuid-a', 'match-history'], 'and');

    await expect(pending).rejects.toBeInstanceOf(LiveQueueAbortError);

    gate.resolve();
    await blocker;
  });

  it('cancelByTagsNotIn 只取消不在保留名单里的任务', async () => {
    const queue = new LiveQueue({ 'match-history': 1, misc: 1 });
    const gate = deferred<void>();

    const blocker = queue.add('match-history', 'blocker', async () => {
      await gate.promise;
      return 'blocker';
    });
    await Promise.resolve();

    const keep = queue.add('match-history', 'keep', async () => 'keep', {
      tags: ['puuid-keep', 'match-history'],
    });
    const drop = queue.add('match-history', 'drop', async () => 'drop', {
      tags: ['puuid-drop', 'match-history'],
    });

    queue.cancelByTagsNotIn('match-history', ['puuid-keep']);

    await expect(drop).rejects.toBeInstanceOf(LiveQueueAbortError);

    gate.resolve();
    await blocker;
    await expect(keep).resolves.toBe('keep');
  });

  it('isLiveQueueAbortError 能识别中止错误', () => {
    expect(isLiveQueueAbortError(new LiveQueueAbortError('x'))).toBe(true);
    expect(isLiveQueueAbortError(new Error('x'))).toBe(false);
  });

  it('取消运行中的任务会以 abort 错误结束其 promise（不会悬挂）', async () => {
    const queue = new LiveQueue({ 'match-history': 1, misc: 1 });
    const gate = deferred<void>();
    const taskState: { signal?: AbortSignal } = {};

    const running = queue.add('match-history', 'running', async (signal) => {
      taskState.signal = signal;
      await gate.promise;
      return 'done';
    }, { tags: ['puuid-a', 'match-history'] });

    await Promise.resolve();
    const rejection = expect(running).rejects.toBeInstanceOf(LiveQueueAbortError);
    queue.cancelByTags(['puuid-a', 'match-history'], 'and');

    // 调用方立即拿到 abort，底层请求同时收到 signal；不需要先放行 run()。
    expect(taskState.signal?.aborted).toBe(true);
    await rejection;

    // 释放这个测试里的模拟底层任务，让队列完成 finally 清理。
    gate.resolve();
    await Promise.resolve();
  });

  it('cancelById 可以取消指定任务', async () => {
    const queue = new LiveQueue({ 'match-history': 1, misc: 1 });
    const gate = deferred<void>();
    const running = queue.add('match-history', 'running', async () => {
      await gate.promise;
      return 'done';
    });

    await Promise.resolve();
    const rejection = expect(running).rejects.toBeInstanceOf(LiveQueueAbortError);
    expect(queue.cancelById('running')).toBe(true);
    expect(queue.cancelById('missing')).toBe(false);
    await rejection;
    gate.resolve();
  });

  it('任务失败后 slot 会被释放，后续任务仍能执行', async () => {
    const queue = new LiveQueue({ 'match-history': 1, misc: 1 });

    const failing = queue.add('match-history', 'fail', async () => {
      throw new Error('boom');
    });
    await expect(failing).rejects.toThrow('boom');

    await expect(
      queue.add('match-history', 'after', async () => 'ok'),
    ).resolves.toBe('ok');
  });
});
