import { createServer } from '../adapters/http/server.js';

export function composeApp() {
  return createServer();
}
