import pino from 'pino';

export class PinoLogger {
  constructor(config = {}) {
    this.logger = pino({
      level: config.level || 'info',
      transport: config.pretty ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:yyyy-mm-dd HH:MM:ss'
        }
      } : undefined,
      serializers: {
        error: pino.stdSerializers.err
      }
    });
  }

  info(obj, msg) {
    if (typeof obj === 'string') {
      this.logger.info(obj);
    } else {
      this.logger.info(obj, msg);
    }
  }

  warn(obj, msg) {
    if (typeof obj === 'string') {
      this.logger.warn(obj);
    } else {
      this.logger.warn(obj, msg);
    }
  }

  error(obj, msg) {
    if (typeof obj === 'string') {
      this.logger.error(obj);
    } else {
      this.logger.error(obj, msg);
    }
  }
}