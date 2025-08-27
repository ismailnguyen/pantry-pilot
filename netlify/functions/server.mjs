import serverless from 'serverless-http';
import { composeApplication } from '../../src/app/compose.js';

// Compose once per function instance
const { server } = composeApplication(); // `server` is an Express app

// Export Netlify handler
export const handler = serverless(server);