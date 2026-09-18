// Configure the Regime Tape daily Cloud Scheduler job.
// Reuses the existing protected scheduler header without printing it.
import { execFileSync } from 'node:child_process';

const project = 'gen-lang-client-0610749770';
const location = 'europe-west3';
const jobId = 'money-scanner-regime-tape-scan';
const existingJobId = 'money-scanner-daily-regime-scan';
const existing = JSON.parse(execFileSync('gcloud', [
  'scheduler', 'jobs', 'describe', existingJobId,
  `--location=${location}`, `--project=${project}`, '--format=json'
], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
const header = Object.entries(existing.httpTarget?.headers || {})
  .find(([name]) => name.toLowerCase() === 'x-daily-scan-token');
if (!header) throw new Error('Existing scheduler authentication header missing');

const uri = new URL('/api/tape/scan', existing.httpTarget.uri).toString();
const config = {
  id: jobId,
  schedule: '30 7 * * *',
  timeZone: 'Europe/Oslo',
  uri
};
console.log(JSON.stringify(config, null, 2));
if (!process.argv.includes('--apply')) process.exit(0);

const token = execFileSync('gcloud', ['auth', 'print-access-token', `--project=${project}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
const root = `https://cloudscheduler.googleapis.com/v1/projects/${project}/locations/${location}/jobs`;
const body = {
  name: `projects/${project}/locations/${location}/jobs/${jobId}`,
  description: 'Daily Regime Tape scan: durable public ledger of Money Line regime transitions with forward outcomes',
  schedule: config.schedule,
  timeZone: config.timeZone,
  attemptDeadline: '900s',
  retryConfig: { retryCount: 2, minBackoffDuration: '60s', maxBackoffDuration: '300s', maxDoublings: 2 },
  httpTarget: {
    uri,
    httpMethod: 'POST',
    headers: { 'Content-Type': 'application/json', [header[0]]: header[1] },
    body: Buffer.from('{}').toString('base64')
  }
};
const create = execFileSync('curl', ['-sS', '-X', 'POST', '-H', `Authorization: Bearer ${token}`, '-H', 'Content-Type: application/json', '-d', JSON.stringify(body), `${root}/`], { encoding: 'utf8' });
console.log(create);
