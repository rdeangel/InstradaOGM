export enum LogLevel {
  SILENT = 0,
  ERROR = 1,
  WARN = 2,
  INFO = 3,
  DEBUG = 4,
}

import { redactSensitiveData } from './log-redactor';

const SENSITIVE_KEYS = [
  'password',
  'totpSecret',
  'backupCodes',
  'accessToken',
  'clientSecret',
  'privateKey',
  'secret',
  'credentials',
  'dbPassword',
  'dbUser',
  'dbHost',
  'dbPort',
  'dbName',
];

class Logger {
  private currentLevel: LogLevel;
  private isBrowser: boolean;

  constructor() {
    this.isBrowser = typeof window !== 'undefined';
    const envLevel = process.env.APP_DEBUG_LEVEL?.toUpperCase();
    switch (envLevel) {
      case 'DEBUG':
        this.currentLevel = LogLevel.DEBUG;
        break;
      case 'INFO':
        this.currentLevel = LogLevel.INFO;
        break;
      case 'WARN':
        this.currentLevel = LogLevel.WARN;
        break;
      case 'ERROR':
        this.currentLevel = LogLevel.ERROR;
        break;
      default:
        this.currentLevel = LogLevel.SILENT; // Default to silent if not specified
        break;
    }

    // Suppress browser console logging in non-development environments
    if (this.isBrowser && process.env.NODE_ENV !== 'development') {
      this.currentLevel = LogLevel.SILENT;
    }
  }

  private log(level: LogLevel, ...args: unknown[]) {
    if (this.currentLevel === LogLevel.SILENT) {
      return; // If level is silent, do not log anything
    }

    if (this.currentLevel >= level) {
      // For browser, only log in development environment
      if (this.isBrowser && process.env.NODE_ENV !== 'development') {
        return; // Do not log in browser for non-development
      }

      let processedArgs = args;
      if (level === LogLevel.DEBUG) {
        processedArgs = args.map(arg => redactSensitiveData(arg, SENSITIVE_KEYS));
      }
      this.outputToConsole(level, ...processedArgs);
    }
  }

  private outputToConsole(level: LogLevel, ...args: unknown[]) {
    switch (level) {
      case LogLevel.ERROR:
        console.error('[ERROR]', ...args); // Direct console call
        break;
      case LogLevel.WARN:
        console.warn('[WARN]', ...args); // Direct console call
        break;
      case LogLevel.INFO:
        console.info('[INFO]', ...args); // Direct console call
        break;
      case LogLevel.DEBUG:
        console.debug('[DEBUG]', ...args); // Direct console call
        break;
      default:
        // Should not happen for levels >= currentLevel
        break;
    }
  }

  debug(...args: unknown[]) { this.log(LogLevel.DEBUG, ...args); }
  info(...args: unknown[]) { this.log(LogLevel.INFO, ...args); }
  warn(...args: unknown[]) { this.log(LogLevel.WARN, ...args); }
  error(...args: unknown[]) { this.log(LogLevel.ERROR, ...args); }
}

export const logger = new Logger();