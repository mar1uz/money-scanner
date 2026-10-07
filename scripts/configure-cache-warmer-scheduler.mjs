// Moves the Money Scanner cache warmer from every minute to every three minutes.
//
// The warmer recomputes the full 219-asset universe scan on every invocation.
// The web client polls the dashboard every 5 minutes (apps/web/src/App.tsx), so
// at a 1-minute cadence four of every five scheduled scans were computed and
// then read by nobody. A 3-minute cadence keeps every reader inside one warm
// interval while cutting the scheduled work by two thirds.
//
// Reuses the existing protected scheduler destination and secret in memory.
// Never prints credentials or request headers. Prints the target configuration
// and exits unless --apply is passed.
import {execFileSync} from 'node:child_process';

const project = 'gen-lang-client-0610749770';
const location = 'europe-west3';
const jobId = 'money-scanner-cache-warmer';
const schedule = '*/3 * * * *';

const existing = JSON.parse(execFileSync('gcloud', [
  'scheduler', 'jobs', 'describe', jobId,
  '--location=' + location, '--project=' + project, '--format=json'
], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}));

const header = Object.entries(existing.httpTarget?.headers || {})
  .find(([name]) => name.toLowerCase() === 'x-daily-scan-token');
if (!header) throw new Error('Existing scheduler authentication header missing');

const uri = existing.httpTarget.uri;
if (!uri.endsWith('/api/scanner/warm')) {
  throw new Error(`Unexpected warmer target: ${uri}`);
}

const description = 'Money Scanner cache warmer: full universe scan on a 3-minute cadence';
const body = {
  name: `projects/${project}/locations/${location}/jobs/${jobId}`,
  description,
  schedule,
  timeZone: existing.timeZone,
  attemptDeadline: existing.attemptDeadline,
  retryConfig: existing.retryConfig,
  httpTarget: existing.httpTarget
};

console.log(JSON.stringify({
  id: jobId,
  scheduleFrom: existing.schedule,
  scheduleTo: schedule,
  timeZone: existing.timeZone,
  uri,
  publish: existing.httpTarget?.oauthToken ? true : false
}, null, 2));

if (!process.argv.includes('--apply')) process.exit(0);

const token = execFileSync('gcloud', ['auth', 'print-access-token', '--project=' + project],
  {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim();

const root = `https://cloudscheduler.googleapis.com/v1/projects/${project}/locations/${location}/jobs`;
const check = await fetch(`${root}/${jobId}`, {headers: {Authorization: `Bearer ${token}`}});
if (!check.ok && check.status !== 404) throw new Error(`Scheduler read failed: ${check.status}`);

const url = `${root}/${jobId}?updateMask=description,schedule`;
const response = await fetch(url, {
  method: 'PATCH',
  headers: {Authorization: `Bearer ${token}`, 'Content-Type': 'application/json'},
  body: JSON.stringify(body)
});
if (!response.ok) throw new Error(`Scheduler write failed (${response.status}); inspect the Cloud console without logging headers`);

const result = await response.json();
console.log(JSON.stringify({id: jobId, state: result.state, schedule: result.schedule, configured: true}));
