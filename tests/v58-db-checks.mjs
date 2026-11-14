import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
export async function run({c,pg,auth,rpc,owner,staff}){
 const payload=(code,name='Label Customer',phone='09943253053')=>({tracking_no:code,name,phone,pieces:2,weight_kg:1.5,allow_create:true});
 const intake=(p,id=randomUUID(),confirmed=true,client=c)=>rpc('td_label_intake_v58',[id,JSON.stringify(p),confirmed],client);
 await c.query('reset role');await auth(c);
 const p=payload('LABEL000001'),id=randomUUID(),r=await intake(p,id);
 assert.equal(r.customer_created,true);assert.deepEqual(await intake(p,id),r);
 assert.equal((await rpc('td_label_resolve_v58',[p.name,p.phone,'LABEL000002'])).status,'matched');
 const r2=await intake(payload('LABEL000002'));assert.equal(r2.customer_id,r.customer_id);assert.equal(r2.customer_created,false);
 await assert.rejects(intake(p));
 await assert.rejects(intake(payload('LABEL000003','Different Customer')));
 await assert.rejects(intake(payload('LABEL000003',p.name,'09911111111')));
 await assert.rejects(intake(payload('LABEL000003','Masked Customer','099****0000')));
 await assert.rejects(intake({...payload('LABEL000003'),automatic:true,confidence:96,min_confidence:99,barcode:'LABEL000003'},randomUUID(),false));
 await assert.rejects(intake({...payload('LABEL000003'),automatic:true,confidence:99,min_confidence:99,barcode:'DIFFERENT'},randomUUID(),false));
 await assert.rejects(intake({...payload('LABEL000003'),automatic:true,confidence:100.5,min_confidence:99,barcode:'LABEL000003'},randomUUID(),false));
 await intake({...payload('LABEL000003'),automatic:true,confidence:99,min_confidence:95,barcode:'LABEL000003'},randomUUID(),false);
 const fence=randomUUID();assert.equal(await rpc('td_label_request_v58',[fence]),null);await assert.rejects(intake(payload('LABEL000004'),fence));
 const second=pg.getPgClient();await second.connect();await auth(second);
 try{const results=await Promise.all([intake(payload('LABELRACE001','Concurrent Customer','09922222222')),intake(payload('LABELRACE002','Concurrent Customer','09922222222'),randomUUID(),true,second)]);assert.equal(results[0].customer_id,results[1].customer_id)}finally{await second.end()}
 await c.query('reset role');
 const snapshot=(await c.query('select td_private.parcel_snapshot_v58(p) s from td_parcels p where id=$1',[r.parcel_id])).rows[0].s;
 const changes={tracking_no:p.tracking_no,description:'Updated',category:'普通包裹',notes:'',weight_kg:2,fee_per_kg:7000,fee_per_piece:0};
 await auth(c);const editId=randomUUID();const args=[editId,r.parcel_id,JSON.stringify(snapshot),JSON.stringify(changes),true];
 const edit=await rpc('td_parcel_edit_v58',args);assert.deepEqual(await rpc('td_parcel_edit_v58',args),edit);
 await assert.rejects(rpc('td_parcel_edit_v58',[randomUUID(),r.parcel_id,JSON.stringify(snapshot),JSON.stringify(changes),true]),/变化/);
 await c.query('reset role');const current=(await c.query('select td_private.parcel_snapshot_v58(p) s from td_parcels p where id=$1',[r.parcel_id])).rows[0].s;await auth(c);
 await assert.rejects(rpc('td_parcel_edit_v58',[randomUUID(),r.parcel_id,JSON.stringify(current),JSON.stringify({...changes,remaining:999}),true]));
 const pay={customer_id:r.customer_id,items:[{parcel_id:r.parcel_id,pieces:2}],weight:2,rate:7000,paid:0,method:'现金',name:p.name,phone:'',notes:''};
 for(const invalid of [{paid:-1},{paid:14001},{paid:'NaN'},{weight:'Infinity'},{weight:0},{rate:-1},{method:'arbitrary'},{paid:1,method:'赊账'},{paid:0.001}])await assert.rejects(rpc('td_scan_checkout_v57',[randomUUID(),JSON.stringify({...pay,...invalid}),true]));
 const checkout=await rpc('td_scan_checkout_v57',[randomUUID(),JSON.stringify({customer_id:r.customer_id,items:[{parcel_id:r.parcel_id,pieces:2},{parcel_id:r2.parcel_id,pieces:2}],weight:3.5,rate:7000,paid:10000,method:'现金',name:p.name,phone:'',notes:''}),true]);
 await assert.rejects(rpc('td_parcel_edit_v58',[randomUUID(),r.parcel_id,JSON.stringify(current),JSON.stringify(changes),true]));
 await c.query('reset role');const balance=(await c.query('select * from td_pickup_balances_v32 where batch_id=$1',[checkout.batch_id])).rows[0];assert.equal(Number(balance.due_mmk),14500);
 // Fail after customer creation; the entire customer/parcel/request transaction must disappear.
 await c.query(`create function public.test_label_fail() returns trigger language plpgsql as $$begin if new.tracking_no='LABELFAIL001' then raise exception 'injected label failure';end if;return new;end$$;create trigger test_label_fail before insert on td_scan_events_v57 for each row execute function public.test_label_fail();`);
 const before=(await c.query('select (select count(*) from td_customers) customers,(select count(*) from td_parcels) parcels,(select count(*) from td_private.label_requests_v58) requests')).rows[0];await auth(c);
 await assert.rejects(intake(payload('LABELFAIL001','Rollback Customer','09933333333')),/injected/);
 await c.query('reset role');assert.deepEqual((await c.query('select (select count(*) from td_customers) customers,(select count(*) from td_parcels) parcels,(select count(*) from td_private.label_requests_v58) requests')).rows[0],before);
 await c.query('drop trigger test_label_fail on td_scan_events_v57');
 await auth(c,staff);await assert.rejects(intake(payload('LABELDENIED1')));await assert.rejects(rpc('td_label_resolve_v58',[p.name,p.phone,'LABELDENIED1']));assert.equal(await rpc('td_label_request_v58',[id]),null);
 await assert.rejects(c.query('select * from td_private.label_requests_v58'));await assert.rejects(c.query("select td_private.label_phone_v58('09943253053')"));
 await c.query('reset role');await c.query('set role anon');await assert.rejects(rpc('td_label_capabilities_v58',[]));await c.query('reset role');await auth(c);
 console.log('PASS V58 database: authoritative matching/conflicts, atomic creation, duplicate and idempotent requests, independent concurrent intake, OCR confirmation gates, edits/concurrency/immutable ledger, batch pickup/debt, failure rollback, anonymous/staff/private isolation.');
}
