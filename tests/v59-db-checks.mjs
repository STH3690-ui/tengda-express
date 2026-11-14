import assert from 'node:assert/strict';import {randomUUID,createHash} from 'node:crypto';
export async function run({c,pg,auth,rpc,owner,staff}){
 await c.query('reset role');await auth(c,owner);
 const session=randomUUID(),digest=s=>createHash('sha256').update(s).digest('hex');
 const payload=(name='Live Customer',phone='09955555555',label='first')=>({name,phone,session_id:session,label_digest:digest(label),stable_frames:3,confidence:98,min_confidence:95});
 const intake=(p,id=randomUUID(),confirmed=false,client=c)=>rpc('td_live_intake_v59',[id,JSON.stringify(p),confirmed],client);
 const p=payload(),id=randomUUID();const r=await intake(p,id);assert.equal(r.parcel_number,'TD59'+id.replaceAll('-',''));assert.equal(r.customer_created,true);assert.deepEqual(await intake(p,id),r);
 await c.query('reset role');const parcel=(await c.query('select pieces,remaining,weight_kg from td_parcels where id=$1',[r.parcel_id])).rows[0];assert.equal(parcel.pieces,1);assert.equal(Number(parcel.weight_kg),0);await auth(c);
 await assert.rejects(intake(p));await assert.rejects(intake(payload('Live Customer','09955555555','different parcel')));
 assert.equal((await rpc('td_live_resolve_v59',[p.name,p.phone,p.label_digest,session])).needs_distinct_confirmation,true);
 const r2=await intake(payload('Live Customer','09955555555','different parcel'),randomUUID(),true);assert.equal(r2.customer_id,r.customer_id);
 for(const bad of [{confidence:94},{stable_frames:2},{min_confidence:89},{confidence:100.01}])await assert.rejects(intake({...payload('Other Live Customer','09966666666','bad'),...bad}));
 await assert.rejects(intake(payload('Hidden Phone','099****9999')));await assert.rejects(intake(payload('Live Customer','09977777777')));
 const fence=randomUUID();assert.equal(await rpc('td_live_request_v59',[fence]),null);await assert.rejects(intake(payload('Fence Customer','09988888888','fenced'),fence));
 const other=pg.getPgClient();await other.connect();await auth(other);try{const q=payload('Race Live Customer','09999999999','race');const race=await Promise.allSettled([intake(q),intake(q,randomUUID(),false,other)]);assert.equal(race.filter(x=>x.status==='fulfilled').length,1)}finally{await other.end()}
 await c.query('reset role');
 await c.query(`create function public.test_live_fail() returns trigger language plpgsql as $$begin raise exception 'injected live request failure';end$$;create trigger test_live_fail before insert on td_private.live_requests_v59 for each row execute function public.test_live_fail();`);
 const before=(await c.query('select (select count(*) from td_customers) customers,(select count(*) from td_parcels) parcels,(select count(*) from td_private.label_requests_v58) requests')).rows[0];await auth(c);
 await assert.rejects(intake(payload('Rollback Live Customer','09912121212','rollback')),/injected/);
 await c.query('reset role');assert.deepEqual((await c.query('select (select count(*) from td_customers) customers,(select count(*) from td_parcels) parcels,(select count(*) from td_private.label_requests_v58) requests')).rows[0],before);await c.query('drop trigger test_live_fail on td_private.live_requests_v59');
 await auth(c,staff);await assert.rejects(intake(payload('Denied Customer','09913131313','denied'),randomUUID(),true));await assert.rejects(c.query('select * from td_private.live_requests_v59'));
 await c.query('reset role');await c.query('set role anon');await assert.rejects(rpc('td_live_capabilities_v59',[]));await c.query('reset role');await auth(c,owner);
 const checkout=await rpc('td_scan_checkout_v57',[randomUUID(),JSON.stringify({customer_id:r.customer_id,items:[{parcel_id:r.parcel_id,pieces:1},{parcel_id:r2.parcel_id,pieces:1}],weight:2,rate:7000,paid:4000,method:'现金',name:p.name,phone:'',notes:''}),true]);await c.query('reset role');const balance=(await c.query('select * from td_pickup_balances_v32 where batch_id=$1',[checkout.batch_id])).rows[0];assert.equal(Number(balance.due_mmk),10000);await auth(c,owner);
 console.log('PASS V59: generated parcel numbers, default one/zero intake weight, authoritative match/create/conflicts, camera-repeat and same-customer distinct confirmation, concurrent dedupe, idempotency/fence, full late-failure rollback, staff/anonymous/privacy and V57 unified-weight pickup/debt.');
}
