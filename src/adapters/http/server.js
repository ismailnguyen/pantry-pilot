import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { createApiKeyAuth } from './authApiKey.js';
import { createRoutes } from './routes.js';

export function createServer({ useCase, envConfig, logger }) {
  const app = express();

  app.use(helmet());
  app.use(cors({
    origin: false,
    credentials: false
  }));
  app.use(express.json({ limit: '10mb' }));

  const apiKeyAuth = createApiKeyAuth(envConfig.get().apiKey);
  app.use('/api', apiKeyAuth);

  const routes = createRoutes({ useCase, envConfig, logger });
  app.use(routes);

  app.use('*', (req, res) => {
    res.status(404).json({
      code: 'not_found',
      message: 'Endpoint not found'
    });
  });

  app.use((error, req, res, next) => {
    logger.error({ 
      error: error.message, 
      stack: error.stack,
      url: req.url,
      method: req.method
    }, 'Unhandled express error');

    if (res.headersSent) {
      return next(error);
    }

    res.status(500).json({
      code: 'internal_error',
      message: 'An internal server error occurred'
    });
  });

  return app;
}

export function startServer(app, port, logger) {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, (error) => {
      if (error) {
        logger.error({ error: error.message, port }, 'Failed to start server');
        reject(error);
      } else {
        logger.info({ port }, 'Server started successfully');
        resolve(server);
      }
    });

    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        logger.error({ port }, 'Port already in use');
      } else {
        logger.error({ error: error.message }, 'Server error');
      }
      reject(error);
    });

    process.on('SIGTERM', () => {
      logger.info('Received SIGTERM, shutting down gracefully');
      server.close(() => {
        logger.info('Server closed');
        process.exit(0);
      });
    });

    process.on('SIGINT', () => {
      logger.info('Received SIGINT, shutting down gracefully');
      server.close(() => {
        logger.info('Server closed');
        process.exit(0);
      });
    });
  });
}