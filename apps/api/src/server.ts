import { runFlowJobs } from './modules/flowbridge/service';
import { app, logger } from './app';
import { config } from './config';
import { db } from './lib/db';
const server = app.listen(config.PORT, '0.0.0.0', () =>
  logger.info({ port: config.PORT }, 'Operations API listening'),
);
// Catch background job failures so a temporary database outage does not become an unhandled rejection.
const flowEnabled = [
  'FLOWBRIDGE_ORGANIZATION_ID',
  'FLOWBRIDGE_BUSINESS_UNIT_ID',
  'META_APP_SECRET',
  'META_VERIFY_TOKEN',
  'META_ACCESS_TOKEN',
  'META_PHONE_NUMBER_ID',
  'WHATSAPP_FLOW_ID',
].every((key) => !!process.env[key]);
const flowTimer = flowEnabled
  ? setInterval(() => {
      void runFlowJobs().catch(() => logger.error('FlowBridge job runner failed'));
    }, 5000)
  : null;
flowTimer?.unref();
server.on('error', (error) => {
  logger.fatal({ err: error }, 'API listener failed');
  process.exitCode = 1;
});
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, () => {
    if (flowTimer) clearInterval(flowTimer);
    server.close(() => {
      void db.$disconnect().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10000).unref();
  });
