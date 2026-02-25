import { App } from './app.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const app = new App(config);

let shuttingDown = false;

async function shutdown(signal: string, exitCode: number): Promise<void> {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  console.log(`[shutdown] Received ${signal}. Closing resources...`);
  await app.stop();
  process.exit(exitCode);
}

process.on('SIGINT', () => {
  void shutdown('SIGINT', 0);
});

process.on('SIGTERM', () => {
  void shutdown('SIGTERM', 0);
});

process.on('uncaughtException', (error) => {
  console.error('[fatal] uncaughtException', error);
  void shutdown('uncaughtException', 1);
});

process.on('unhandledRejection', (reason) => {
  console.error('[fatal] unhandledRejection', reason);
  void shutdown('unhandledRejection', 1);
});

try {
  await app.start();
} catch (error) {
  console.error('[startup] Failed to start application', error);
  await app.stop();
  process.exit(1);
}
