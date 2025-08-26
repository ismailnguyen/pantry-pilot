#!/usr/bin/env node

import { composeApplication } from './compose.js';
import { startServer } from '../adapters/http/server.js';

async function main() {
  try {
    const { server, config, logger } = composeApplication();
    
    logger.info({ 
      nodeVersion: process.version,
      timezone: config.timezone,
      env: process.env.NODE_ENV || 'production'
    }, 'Starting Pantry Pilot Service');

    await startServer(server, config.port, logger);
    
  } catch (error) {
    console.error('Failed to start application:', error.message);
    if (error.details) {
      console.error('Details:', error.details);
    }
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}