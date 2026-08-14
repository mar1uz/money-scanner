import { ScannerWorker } from './worker.js';

const intervalSec = parseInt(process.env.SCAN_INTERVAL_SECONDS || '60', 10);
const worker = new ScannerWorker();

worker.start(intervalSec);

process.on('SIGINT', () => {
  worker.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  worker.stop();
  process.exit(0);
});
