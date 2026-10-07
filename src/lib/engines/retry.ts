export type RetryResult<T> = {
  success: boolean;
  attempts: number;
  result?: T;
  error?: Error;
};

type RetryOptions = {
  maxAttempts?: number;
  delayMs?: number;
  shouldRetry?: (error: unknown) => boolean;
};

export async function withRetry<T>(
  operation: (attempt: number) => Promise<T>,
  options: RetryOptions = {}
): Promise<RetryResult<T>> {
  const maxAttempts =
    options.maxAttempts ?? 3;

  const delayMs =
    options.delayMs ?? 500;

  const shouldRetry =
    options.shouldRetry ??
    ((error: unknown) => {
      if (
        error instanceof Error &&
        error.message.includes("503")
      ) {
        return true;
      }

      return false;
    });

  let lastError: Error | null = null;

  for (
    let attempt = 1;
    attempt <= maxAttempts;
    attempt++
  ) {
    try {
      const result = await operation(attempt);

      return {
        success: true,
        attempts: attempt,
        result,
      };
    } catch (error) {
      lastError =
        error instanceof Error
          ? error
          : new Error(
              "Unknown retry error."
            );

      if (
        attempt === maxAttempts ||
        !shouldRetry(error)
      ) {
        break;
      }

      await new Promise((resolve) =>
        setTimeout(resolve, delayMs * attempt)
      );
    }
  }

  return {
    success: false,
    attempts: maxAttempts,
    error:
      lastError ??
      new Error("Operation failed."),
  };
}