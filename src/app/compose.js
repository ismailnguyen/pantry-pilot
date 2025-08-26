import { CheckAndNotifyReplenishment } from '../domain/usecases/CheckAndNotifyReplenishment.js';
import { GoogleSheetsInventoryRepository } from '../adapters/inventory/googleSheets/GoogleSheetsInventoryRepository.js';
import { SmtpEmailNotifier } from '../adapters/notify/email/SmtpEmailNotifier.js';
import { SystemClock } from '../adapters/runtime/SystemClock.js';
import { PinoLogger } from '../adapters/runtime/PinoLogger.js';
import { EnvConfig } from '../adapters/runtime/EnvConfig.js';
import { createServer } from '../adapters/http/server.js';

export function composeApplication() {
  const envConfig = new EnvConfig();
  const config = envConfig.get();
  
  const logger = new PinoLogger({
    level: process.env.LOG_LEVEL || 'info',
    pretty: process.env.NODE_ENV === 'development'
  });

  const clock = new SystemClock();

  function createUseCase(mergedConfig) {
    const inventoryRepository = new GoogleSheetsInventoryRepository({
      config: {
        spreadsheetId: mergedConfig.inventory.spreadsheetId,
        sheetName: mergedConfig.inventory.sheetName,
        clientEmail: mergedConfig.google.clientEmail,
        privateKey: mergedConfig.google.privateKey
      },
      logger
    });

    const notifier = new SmtpEmailNotifier({
      config: mergedConfig.smtp,
      logger
    });

    return new CheckAndNotifyReplenishment({
      inventoryRepository,
      notifier,
      clock,
      logger
    });
  }

  function createUseCaseWithConfig(requestConfig = {}) {
    const mergedConfig = envConfig.mergeWithRequestConfig(requestConfig);
    return createUseCase(mergedConfig);
  }

  const server = createServer({
    useCase: { execute: async (params) => {
      const useCase = createUseCaseWithConfig();
      return useCase.execute(params);
    }},
    envConfig,
    logger
  });

  return {
    server,
    config,
    logger,
    createUseCase: createUseCaseWithConfig
  };
}