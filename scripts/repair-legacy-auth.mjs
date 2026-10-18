// Server-side one-time repair. Run ONLY after verifying the test project's ref.
import { randomUUID } from 'node:crypto';
const ref=process.env.TD_TEST_PROJECT_REF;
if(process.env.TD_ENVIRONMENT!=='tengda-v32-test'||!ref||!/^[a-z0-9]+$/.test(ref)||process.env.SUPABASE_URL!==`https://${ref}.supabase.co`||!process.env.SUPABASE_SERVICE_ROLE_KEY)throw new Error('Verified test-project configuration required');
const base=process.env.SUPABASE_URL+'/auth/v1/admin/users';
const headers={apikey:process.env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+process.env.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json'};
async function api(url,options={}){const r=await fetch(url,{...options,headers});if(!r.ok)throw new Error('Auth maintenance request failed (HTTP '+r.status+'); no credential details logged');return r.json();}
const legacy=[];
for(let page=1;;page++){
 const result=await api(base+`?page=${page}&per_page=100`);const users=result.users||[];
 legacy.push(...users.filter(u=>u.email?.toLowerCase().endsWith('@staff.tengda.example.com')));
 if(users.length<100)break;
}
// Finish listing before updates so pagination is stable.
let repaired=0;
for(const user of legacy){
 const username=user.user_metadata?.username||user.email.split('@')[0].toLowerCase();
 await api(base+'/'+encodeURIComponent(user.id),{method:'PUT',body:JSON.stringify({email:`${randomUUID()}@${ref}.supabase.co`,email_confirm:true,user_metadata:{...user.user_metadata,username}})});
 repaired++;
}
console.log(`Repaired ${repaired} legacy Auth identities in the configured test project. Passwords and membership status unchanged.`);
