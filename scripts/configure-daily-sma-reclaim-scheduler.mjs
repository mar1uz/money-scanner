// Configure the independent daily SMA reclaim Cloud Scheduler job.
// Reuses the existing protected scheduler header without printing it.
import { execFileSync } from 'node:child_process';

const project = 'gen-lang-client-0610749770';
const location = 'europe-west3';
const jobId = 'money-scanner-daily-sma-reclaim';
const existingJobId = 'money-scanner-daily-regime-scan';
const existing = JSON.parse(execFileSync('gcloud', [
  'scheduler', 'jobs', 'describe', existingJobId,
  `--location=${location}`, `--project=${project}`, '--format=json'
], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
const header = Object.entries(existing.httpTarget?.headers || {})
  .find(([name]) => name.toLowerCase() === 'x-daily-scan-token');
if (!header) throw new Error('Existing scheduler authentication header missing');

const uri = new URL('/api/alerts/daily-sma-reclaim/scheduled', existing.httpTarget.uri).toString();
const config = {
  id: jobId,
  schedule: '0 8 * * *',
  timeZone: 'Europe/Oslo',
  uri
};
console.log(JSON.stringify(config, null, 2));
if (!process.argv.includes('--apply')) process.exit(0);

const token = execFileSync('gcloud', ['auth', 'print-access-token', `--project=${project}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
const root = `https://cloudscheduler.googleapis.com/v1/projects/${project}/locations/${location}/jobs`;
const body = {
  name: `projects/${project}/locations/${location}/jobs/${jobId}`,
  description: 'Daily SMA 50/200 reclaim scan; independent from MoneyLine regime and strategy scans',
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
const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
const check = await fetch(`${root}/${jobId}`, { headers: auth });
if (!check.ok && check.status !== 404) throw new Error(`Scheduler read failed: ${check.status}`);
const exists = check.ok;
const url = exists ? `${root}/${jobId}?updateMask=description,schedule,timeZone,attemptDeadline,retryConfig,httpTarget` : root;
const response = await fetch(url, { method: exists ? 'PATCH' : 'POST', headers: auth, body: JSON.stringify(body) });
if (!response.ok) {
  const detail = await response.text();
  throw new Error(`Scheduler write failed (${response.status}): ${detail.slice(0, 300)}`);
}
const result = await response.json();
console.log(JSON.stringify({ id: jobId, state: result.state, configured: true }));
