import { Router } from 'express';
import { ValidationError, AdapterError } from '../../domain/errors/DomainError.js';

export function createRoutes({ useCase, envConfig, logger }) {
  const router = Router();

  router.get('/healthz', (req, res) => {
    res.json({
      ok: true,
      time: new Date().toISOString()
    });
  });

  router.post('/api/check-replenishment', async (req, res) => {
    const requestId = req.headers['x-request-id'] || Math.random().toString(36).substring(7);
    const startTime = Date.now();

    logger.info({ 
      requestId, 
      userAgent: req.headers['user-agent'],
      body: req.body ? 'present' : 'empty'
    }, 'Processing replenishment check request');

    try {
      const config = envConfig.mergeWithRequestConfig(req.body);
      
      const result = await useCase.execute({
        policyOverrides: {
          reviewHorizonDays: config.options.reviewHorizonDays,
          overrideTargetWindowDays: config.options.overrideTargetWindowDays
        },
        notification: config.notification
      });

      const duration = Date.now() - startTime;
      logger.info({ 
        requestId, 
        duration,
        checkedCount: result.checkedCount,
        needsReplenishmentCount: result.needsReplenishmentCount
      }, 'Request completed successfully');

      res.json(result);

    } catch (error) {
      const duration = Date.now() - startTime;
      
      if (error instanceof ValidationError) {
        logger.warn({ 
          requestId, 
          duration,
          error: error.message, 
          details: error.details 
        }, 'Request validation failed');
        
        return res.status(400).json({
          code: 'bad_request',
          message: error.message,
          details: error.details
        });
      }

      if (error instanceof AdapterError) {
        logger.error({ 
          requestId, 
          duration,
          adapter: error.adapter,
          error: error.message 
        }, 'Adapter error occurred');
        
        return res.status(500).json({
          code: 'adapter_error',
          adapter: error.adapter,
          message: error.message
        });
      }

      logger.error({ 
        requestId, 
        duration,
        error: error.message,
        stack: error.stack
      }, 'Unexpected error occurred');

      res.status(500).json({
        code: 'internal_error',
        message: 'An internal server error occurred'
      });
    }
  });

  return router;
}