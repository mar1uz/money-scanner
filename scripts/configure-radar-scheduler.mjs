// Reuses the existing protected scheduler destination and secret in memory.
// Never prints credentials or request headers. Run with --apply after deploying Radar.
import {execFileSync} from 'node:child_process';
const project='gen-lang-client-0610749770',location='europe-west3';
const existing=JSON.parse(execFileSync('gcloud',['scheduler','jobs','describe','money-scanner-daily-regime-scan','--location='+location,'--project='+project,'--format=json'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}));
const header=Object.entries(existing.httpTarget.headers||{}).find(([name])=>name.toLowerCase()==='x-daily-scan-token');
if(!header)throw new Error('Existing scheduler authentication header missing');
const uri=new URL('/api/radar/scheduled',existing.httpTarget.uri).toString();
const jobs=[{id:'money-scanner-radar-collect',schedule:'*/30 * * * *',publish:false},{id:'money-scanner-radar-report',schedule:'5 0,12 * * *',publish:true}];
console.log(JSON.stringify(jobs.map(j=>({id:j.id,schedule:j.schedule,timeZone:'UTC',uri,publish:j.publish})),null,2));
if(!process.argv.includes('--apply'))process.exit(0);
const token=execFileSync('gcloud',['auth','print-access-token','--project='+project],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
const root=`https://cloudscheduler.googleapis.com/v1/projects/${project}/locations/${location}/jobs`;
for(const j of jobs){
 const body={name:`projects/${project}/locations/${location}/jobs/${j.id}`,description:'Crypto Radar: free sources, persistent history, no LLM calls',schedule:j.schedule,timeZone:'UTC',attemptDeadline:'600s',retryConfig:{retryCount:2,minBackoffDuration:'60s',maxBackoffDuration:'300s',maxDoublings:2},httpTarget:{uri,httpMethod:'POST',headers:{'Content-Type':'application/json',[header[0]]:header[1]},body:Buffer.from(JSON.stringify({publish:j.publish})).toString('base64')}};
 const auth={Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
 const check=await fetch(`${root}/${j.id}`,{headers:auth});
 if(!check.ok&&check.status!==404)throw new Error(`Scheduler read failed: ${check.status}`);
 const exists=check.ok;
 const url=exists?`${root}/${j.id}?updateMask=description,schedule,timeZone,attemptDeadline,retryConfig,httpTarget`:root;
 const response=await fetch(url,{method:exists?'PATCH':'POST',headers:auth,body:JSON.stringify(body)});
 if(!response.ok)throw new Error(`Scheduler write failed (${response.status}); inspect cloud console without logging headers`);
 const result=await response.json();console.log(JSON.stringify({id:j.id,state:result.state,configured:true}));
}
