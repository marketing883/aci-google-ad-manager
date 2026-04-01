// ============================================================
// Logger utility with timing support
// ============================================================

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_COLORS: Record<LogLevel, string> = {
  debug: '\x1b[36m', // cyan
  info: '\x1b[32m',  // green
  warn: '\x1b[33m',  // yellow
  error: '\x1b[31m', // red
};
const RESET = '\x1b[0m';

class Logger {
  private context: string;

  constructor(context: string) {
    this.context = context;
  }

  private log(level: LogLevel, message: string, data?: Record<string, unknown>) {
    const timestamp = new Date().toISOString();
    const color = LOG_COLORS[level];
    const prefix = `${color}[${level.toUpperCase()}]${RESET} [${timestamp}] [${this.context}]`;

    if (data) {
      console[level === 'error' ? 'error' : 'log'](`${prefix} ${message}`, data);
    } else {
      console[level === 'error' ? 'error' : 'log'](`${prefix} ${message}`);
    }
  }

  debug(message: string, data?: Record<string, unknown>) {
    if (process.env.NODE_ENV === 'development') {
      this.log('debug', message, data);
    }
  }

  info(message: string, data?: Record<string, unknown>) {
    this.log('info', message, data);
  }

  warn(message: string, data?: Record<string, unknown>) {
    this.log('warn', message, data);
  }

  error(message: string, data?: Record<string, unknown>) {
    this.log('error', message, data);
  }

  // Timer utility
  startTimer(label: string): () => number {
    const start = performance.now();
    this.debug(`Timer started: ${label}`);
    return () => {
      const duration = Math.round(performance.now() - start);
      this.info(`Timer ${label}: ${duration}ms`);
      return duration;
    };
  }
}

export function createLogger(context: string): Logger {
  return new Logger(context);
}
