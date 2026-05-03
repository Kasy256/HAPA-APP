/**
 * HAPA Logger - Centralized logging utility for debugging crashes and performance.
 * In a production app, this would send logs to a service like Sentry or Datadog.
 */

const IS_DEV = __DEV__;

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL';

class Logger {
    private formatMessage(level: LogLevel, context: string, message: string) {
        const timestamp = new Date().toISOString();
        return `[${timestamp}] [${level}] [${context}] ${message}`;
    }

    debug(context: string, message: string, data?: any) {
        if (!IS_DEV) return;
        console.log(this.formatMessage('DEBUG', context, message), data || '');
    }

    info(context: string, message: string, data?: any) {
        console.log(this.formatMessage('INFO', context, message), data || '');
    }

    warn(context: string, message: string, data?: any) {
        console.warn(this.formatMessage('WARN', context, message), data || '');
    }

    error(context: string, message: string, error?: any) {
        console.error(this.formatMessage('ERROR', context, message), error || '');
        
        // TODO: In production, send to Sentry here:
        // Sentry.captureException(error, { extra: { context, message } });
    }

    critical(context: string, message: string, error?: any) {
        console.error('!!! CRITICAL ERROR !!!');
        console.error(this.formatMessage('CRITICAL', context, message), error || '');
    }
}

export const logger = new Logger();
