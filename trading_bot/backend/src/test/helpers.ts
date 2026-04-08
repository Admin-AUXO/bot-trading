type Restore = () => void;

export function stubProperty<
  T extends object,
  K extends keyof T,
>(target: T, key: K, value: T[K]): Restore {
  const original = target[key];
  target[key] = value;
  return () => {
    target[key] = original;
  };
}

export function stubDateNow(timestampMs: number): Restore {
  return stubProperty(Date, "now", (() => timestampMs) as typeof Date.now);
}

export function captureCreateCalls<
  T extends { create: (...args: any[]) => Promise<unknown> },
>(delegate: T): {
  calls: Array<Parameters<T["create"]>[0]>;
  restore: Restore;
} {
  const calls: Array<Parameters<T["create"]>[0]> = [];
  const restore = stubProperty(
    delegate,
    "create",
    (async (args: Parameters<T["create"]>[0]) => {
      calls.push(args);
      return {} as Awaited<ReturnType<T["create"]>>;
    }) as T["create"],
  );

  return { calls, restore };
}

export function stubFetch(
  handler: (url: string | URL | Request, init?: RequestInit) => Promise<Response>,
): Restore {
  return stubProperty(globalThis, "fetch", (async (url: string | URL | Request, init?: RequestInit) =>
    handler(url, init)) as typeof fetch);
}

export function captureIntervals(): {
  callbacks: Array<() => unknown>;
  restore: Restore;
} {
  const callbacks: Array<() => unknown> = [];
  const restoreSetInterval = stubProperty(
    globalThis,
    "setInterval",
    (((
      callback: (...args: any[]) => unknown,
      _delay?: number,
      ...args: any[]
    ) => {
      callbacks.push(() => callback(...args));
      return callbacks.length as unknown as ReturnType<typeof setInterval>;
    }) as unknown as typeof setInterval),
  );
  const restoreClearInterval = stubProperty(
    globalThis,
    "clearInterval",
    (((_handle?: ReturnType<typeof setInterval>) => undefined) as typeof clearInterval),
  );

  return {
    callbacks,
    restore: () => {
      restoreClearInterval();
      restoreSetInterval();
    },
  };
}
