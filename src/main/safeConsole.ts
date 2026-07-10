const BROKEN_PIPE_CODE = 'EPIPE';
const CONSOLE_METHODS = ['log', 'info', 'warn', 'error', 'debug'] as const;

function isBrokenPipe(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const maybeNodeError = error as { code?: unknown; message?: unknown };
  return (
    maybeNodeError.code === BROKEN_PIPE_CODE ||
    (typeof maybeNodeError.message === 'string' &&
      maybeNodeError.message.toLowerCase().includes('broken pipe'))
  );
}

function guardConsoleMethod(method: (typeof CONSOLE_METHODS)[number]): void {
  const target = console as unknown as Record<(typeof CONSOLE_METHODS)[number], (...args: unknown[]) => void>;
  const original = target[method].bind(console);

  target[method] = (...args: unknown[]) => {
    try {
      original(...args);
    } catch (error) {
      if (!isBrokenPipe(error)) throw error;
    }
  };
}

function guardOutputStream(stream: NodeJS.WritableStream | undefined): void {
  stream?.on?.('error', (error) => {
    if (isBrokenPipe(error)) return;
    setImmediate(() => {
      throw error;
    });
  });
}

for (const method of CONSOLE_METHODS) {
  guardConsoleMethod(method);
}

guardOutputStream(process.stdout);
guardOutputStream(process.stderr);
