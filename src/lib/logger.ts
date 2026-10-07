export type LogLevel = "info" | "warn" | "error" | "debug";

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  requestId?: string;
}

export class Logger {
  private static sanitize(obj?: Record<string, unknown>): Record<string, unknown> | undefined {
    if (!obj) return undefined;
    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();
      if (
        lowerKey.includes("secret") ||
        lowerKey.includes("key") ||
        lowerKey.includes("token") ||
        lowerKey.includes("password") ||
        lowerKey.includes("authorization")
      ) {
        sanitized[key] = "[REDACTED]";
      } else if (typeof value === "object" && value !== null) {
        sanitized[key] = this.sanitize(value as Record<string, unknown>);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  static info(message: string, context?: Record<string, unknown>, requestId?: string): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: "info",
      message,
      context: this.sanitize(context),
      requestId,
    };
    console.log(JSON.stringify(entry));
  }

  static warn(message: string, context?: Record<string, unknown>, requestId?: string): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: "warn",
      message,
      context: this.sanitize(context),
      requestId,
    };
    console.warn(JSON.stringify(entry));
  }

  static error(message: string, error?: unknown, context?: Record<string, unknown>, requestId?: string): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: "error",
      message,
      context: {
        ...this.sanitize(context),
        error: error instanceof Error ? { message: error.message, stack: error.stack } : error,
      },
      requestId,
    };
    console.error(JSON.stringify(entry));
  }
}
