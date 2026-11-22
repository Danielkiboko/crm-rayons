import { onRequest } from 'firebase-functions/v2/https';
import { app } from './index.js';

export const api = onRequest(
  {
    region: 'europe-west1',
    memory: '512MiB',
    timeoutSeconds: 60,
    maxInstances: 1,
    cors: true
  },
  app
);
