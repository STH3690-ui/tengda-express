// Disposable local PostgreSQL only. Never accepts a remote DATABASE_URL.
import EmbeddedPostgres from 'embedded-postgres';
import {readFile,mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {randomUUID} from 'node:crypto';import assert from 'node:assert/strict';
const directory=await mkdtemp(join(tmpdir(),'tengda-scan-db-'));
const pg=new EmbeddedPostgres({databaseDir:join(directory,'data'),user:'postgres',password:'local-test-only',port:55487,persistent:false,onLog:()=>{},onError:()=>{}});
let c;
try{
 await pg.initialise();await pg.start();c=pg.getPgClient();await c.connect();
 await c.query(`create role anon;create role authenticated;create role service_role;create schema auth;create schema storage;
 create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}',created_at timestamptz default now());
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('sub',auth.uid(),'role',coalesce(nullif(current_setting('request.jwt.claim.role',true),''),'service_role'))$$;
 grant usage on schema auth to authenticated,anon;grant execute on all functions in schema auth to authenticated,anon;
 create table storage.buckets(id text primary key,name text,public boolean);
 create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;`);
 for(const file of ['docs/PRODUCTION_MIGRATION.sql','migrations/permissions_safe_delete_v50_DRAFT.sql','sql/staff-entry-delete-v54.sql','sql/deletion-history-relations-v55.sql','sql/history-batch-delete-v56.sql','supabase/migrations/20261113131906_smart_scan_pos_v57.sql']){
  try{if(file.includes('smart_scan_pos'))await c.query(`create table public.td_parcel_hidden_v51(parcel_id uuid primary key,hidden_by uuid,hidden_at timestamptz default now(),reason text);create table public.td_pickup_hidden_v53(batch_id uuid primary key,hidden_by uuid,hidden_at timestamptz default now(),reason text);`);let sql=await readFile(file,'utf8');if(file==='docs/PRODUCTION_MIGRATION.sql'){const keys=sql.split('\n').filter(l=>l.includes('ADD CONSTRAINT')&&l.includes('PRIMARY KEY')).join('\n');const pos=sql.indexOf('DO $$ BEGIN IF NOT EXISTS(select 1 from pg_constraint');sql=sql.slice(0,pos)+keys+'\n'+sql.slice(pos)}await c.query(sql);}catch(e){console.error('Migration failed:',file,e.message);throw e;}
 }
 const owner=randomUUID(),staff=randomUUID(),customer=randomUUID(),other=randomUUID();
 await c.query('insert into auth.users(id) values($1),($2)',[owner,staff]);await c.query("insert into td_members(id,display_name,role,active,permissions) values($1,'Owner','owner',true,'{}'),($2,'Staff','staff',true,'{}')",[owner,staff]);
 await c.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);
 await c.query("insert into td_customers(id,name,phone) values($1,'Customer','sensitive-phone'),($2,'Other','private')",[customer,other]);
 async function auth(client,id=owner){await client.query("select set_config('request.jwt.claim.role','authenticated',false)");await client.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await client.query('set role authenticated');}
 await auth(c);
 const rpc=async(name,args,client=c)=>(await client.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as result`,args)).rows[0].result;
 const intake=(code,cid=customer)=>({tracking_no:code,customer_id:cid,pieces:2,weight_kg:1.5,category:'普通包裹',notes:''});
 await c.query("insert into td_parcels(customer_id,tracking_no,pieces,remaining,created_by) values($1,'NORMAL100',1,1,$2)",[customer,owner]);
 const key=randomUUID(),items=[intake('ZX10001'),intake('ZX10002',randomUUID())];
 const r=await rpc('td_scan_intake_v57',[key,JSON.stringify(items)]);assert.equal(r[0].success,true);assert.equal(r[1].success,false);assert.deepEqual(await rpc('td_scan_intake_v57',[key,JSON.stringify(items)]),r);
 assert.equal((await rpc('td_scan_intake_v57',[randomUUID(),JSON.stringify([intake(' zx10001 ')])]))[0].success,false);
 const p=r[0].parcel_id;assert.equal((await rpc('td_scan_lookup_v57',['ZX10001','query']))[0].remaining,2);
 await assert.rejects(rpc('td_scan_lookup_v57',['javascript:alert(1)','query']));
 const payload={customer_id:customer,items:[{parcel_id:p,pieces:2}],weight:1.5,rate:7000,paid:5000,method:'现金',name:'Receiver',phone:'',notes:''};
 await assert.rejects(rpc('td_scan_checkout_v57',[randomUUID(),JSON.stringify(payload),false]));
 const late=randomUUID();assert.equal(await rpc('td_scan_request_v57',[late]),null);await assert.rejects(rpc('td_scan_checkout_v57',[late,JSON.stringify(payload),true]),/请求编号/);assert.equal((await rpc('td_scan_lookup_v57',['ZX10001','query']))[0].remaining,2);
 const checkout=randomUUID(),paid=await rpc('td_scan_checkout_v57',[checkout,JSON.stringify(payload),true]);assert.equal(paid.success,true);assert.deepEqual(await rpc('td_scan_checkout_v57',[checkout,JSON.stringify(payload),true]),paid);
 await assert.rejects(rpc('td_scan_checkout_v57',[randomUUID(),JSON.stringify(payload),true]));
 assert.equal((await rpc('td_scan_lookup_v57',['ZX10001','query']))[0].status,'picked');assert.equal((await rpc('td_scan_lookup_v57',['ZX10001','query']))[0].pickups.length,1);
 await c.query('reset role');const balance=(await c.query('select * from td_pickup_balances_v32 where batch_id=$1',[paid.batch_id])).rows[0];assert.equal(Number(balance.receivable_mmk),10500);assert.equal(Number(balance.paid_mmk),5000);assert.equal(Number(balance.due_mmk),5500);
 await auth(c,staff);await assert.rejects(rpc('td_scan_intake_v57',[randomUUID(),JSON.stringify([intake('NOAUTH1')])]));assert.equal((await rpc('td_scan_lookup_v57',['ZX10001','query']))[0].customer_phone,'');assert.equal((await c.query("select count(*) from td_scan_events_v57 where actor<>$1",[staff])).rows[0].count,'0');await assert.rejects(c.query("insert into td_scan_events_v57(tracking_no,operation,actor,result) values('FORGE1','query',$1,'forged')",[staff]));
 await c.query('reset role');await auth(c);
 const fresh=(await rpc('td_scan_intake_v57',[randomUUID(),JSON.stringify([intake('CONCURRENT1'),intake('ROLLBACK1'),intake('HIDDEN100')])])).map(x=>x.parcel_id);
 // Real independent database connections prove concurrent checkout cannot double-charge.
 const second=pg.getPgClient();await second.connect();await auth(second);
 const duplicates=await Promise.all([rpc('td_scan_intake_v57',[randomUUID(),JSON.stringify([intake('RACEWAYBILL')])]),rpc('td_scan_intake_v57',[randomUUID(),JSON.stringify([intake('RACEWAYBILL')])],second)]);assert.equal(duplicates.flat().filter(x=>x.success).length,1);
 const simultaneous={...payload,items:[{parcel_id:fresh[0],pieces:2}]};const concurrent=await Promise.allSettled([rpc('td_scan_checkout_v57',[randomUUID(),JSON.stringify(simultaneous),true]),rpc('td_scan_checkout_v57',[randomUUID(),JSON.stringify(simultaneous),true],second)]);assert.equal(concurrent.filter(x=>x.status==='fulfilled').length,1);await second.end();
 // Failure after V32 ledger writes must roll back inventory, payment, receipt, batch and audit.
 await c.query('reset role');await c.query(`create function public.test_scan_fail() returns trigger language plpgsql as $$begin if new.result='settled' then raise exception 'injected audit failure';end if;return new;end$$;create trigger test_scan_fail before insert on td_scan_events_v57 for each row execute function public.test_scan_fail();`);
 const before=(await c.query('select (select count(*) from td_payments) payments,(select count(*) from td_pickup_batches) batches')).rows[0];await auth(c);
 const rollback={...payload,items:[{parcel_id:fresh[1],pieces:2}]};await assert.rejects(rpc('td_scan_checkout_v57',[randomUUID(),JSON.stringify(rollback),true]),/injected/);
 assert.equal((await rpc('td_scan_lookup_v57',['ROLLBACK1','query']))[0].remaining,2);await c.query('reset role');assert.deepEqual((await c.query('select (select count(*) from td_payments) payments,(select count(*) from td_pickup_batches) batches')).rows[0],before);await c.query('drop trigger test_scan_fail on td_scan_events_v57');
 await c.query("insert into td_business_hidden_v54(source_table,source_id,reason,hidden_by,batch_id,snapshot) values('td_parcels',$1,'测试删除保护',$2,gen_random_uuid(),'{}')",[fresh[2],owner]);await auth(c);assert.equal((await rpc('td_scan_lookup_v57',['HIDDEN100','query']))[0].status,'deleted');await assert.rejects(rpc('td_scan_checkout_v57',[randomUUID(),JSON.stringify({...payload,items:[{parcel_id:fresh[2],pieces:2}]}),true]));
 await c.query('reset role');await c.query("insert into td_parcel_hidden_v51(parcel_id,reason,hidden_by) values($1,'旧版删除',$2)",[fresh[1],owner]);await auth(c);assert.equal((await rpc('td_scan_lookup_v57',['ROLLBACK1','query']))[0].status,'deleted');
 assert.equal((await c.query("select has_schema_privilege('authenticated','td_private','USAGE') ok")).rows[0].ok,true);
 console.log('PASS PostgreSQL V57: full existing migrations, permissions/RLS/privacy, mixed intake results, normalized duplicate prevention, idempotency, authoritative freight/debt, real concurrent checkout, late-failure rollback, hidden parcel protection.');
}finally{if(c)await c.end();await pg.stop();await rm(directory,{recursive:true,force:true});}
