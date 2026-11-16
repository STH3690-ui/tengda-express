/* Read-only list pagination. Full accounting snapshots remain separate and complete. */
'use strict';
const tdPaged={size:50,states:new Map(),visibility:null,visibilityAt:0,epoch:0,timers:new Map()};
const tdPagedTables={customers:'td_customers',orders:'td_orders',parcels:'td_parcels',records:null,payments:'td_payments'};
const tdPagedOriginal={customers,orders,parcels,records,payments,filterRecords,filterOrderRows,tdParcelOrderChoices};
function tdPagedActive(id=page){return id!=='payments'&&!tdDataReady&&Object.hasOwn(tdPagedTables,id)}
function tdPagedReset(){tdPaged.epoch++;tdPaged.states.clear();tdPaged.visibility=null;tdPaged.visibilityAt=0;for(const timer of tdPaged.timers.values())clearTimeout(timer);tdPaged.timers.clear();}
function tdPagedState(id=page){if(!tdPaged.states.has(id))tdPaged.states.set(id,{offset:0,term:'',kind:'',rows:[],next:false,loaded:false,token:0});return tdPaged.states.get(id)}
async function tdPagedRequest(query){const controller=new AbortController();let timer;try{return await Promise.race([typeof query.abortSignal==='function'?query.abortSignal(controller.signal):query,new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('读取超时，请重试'))},20000)})])}finally{clearTimeout(timer)}}
function tdPagedHidden(table,row){return (table==='td_customers'&&role!=='owner'&&!!row.deleted_at)||hiddenBusinessIds.has(table+':'+row.id)||(table==='td_orders'&&hiddenOrderIds.has(row.id))||(table==='td_parcels'&&hiddenParcelIds.has(row.id))||(page==='records'&&hiddenAuditIds.has(table+':'+row.id))}
function tdPagedQuote(term){return JSON.stringify('%'+term.replace(/[\\%_]/g,'\\$&')+'%')}
async function tdPagedNames(rows){const ids=[...new Set(rows.map(x=>x.customer_id).filter(Boolean))];if(!ids.length)return [];
 const r=await tdPagedRequest(db.from('td_customers').select('id,name,phone,deleted_at').in('id',ids));if(r.error)throw r.error;return r.data||[];
}
function tdPagedRemember(table,rows){if(tdDataReady)return;if(table==='td_customers'&&page!=='customers'){const selected=document.querySelector('#tdPageContent select[name="customer_id"]')?.value;rows=[...rows,...data.td_customers.filter(x=>x.id===selected)];rows=Array.from(new Map(rows.map(x=>[x.id,x])).values())}data[table]=rows;}
function tdPagedPlaceholder(id){return '<section id="tdPagedList" data-list="'+id+'" aria-live="polite"><p role="status">正在读取列表…</p></section>'}
function tdPagedForm(id){
 if(!tdPagedActive(id)){
  const table=tdPagedTables[id];if(!table)return tdPagedOriginal[id]();
  const original=data[table],state=tdPagedState(id),term=state.term.toLowerCase();const filtered=term?original.filter(x=>[x.name,x.phone,x.notes,x.item_name,x.tracking_no,x.description,x.direction,x.method,x.amount,x.customer_id?name(x.customer_id):''].some(v=>String(v||'').toLowerCase().includes(term))):original;
  data[table]=filtered.slice(state.offset,state.offset+tdPaged.size);let html;try{html=tdPagedOriginal[id]()}finally{data[table]=original}
  if(id==='customers')html=html.replace(/客户列表（正常 \d+ \/ 已归档 \d+）/,'客户列表（当前页）');
  state.next=state.offset+tdPaged.size<filtered.length;
  return html+'<label>搜索全部记录<input autocomplete="off" value="'+esc(state.term)+'" oninput="tdPagedSearch(this.value)"></label><div class="td-action-row"><button type="button" class="secondary" '+(!state.offset?'disabled':'')+' onclick="tdPagedMove(-1)">上一页</button><span>第 '+(state.offset/tdPaged.size+1)+' 页</span><button type="button" class="secondary" '+(!state.next?'disabled':'')+' onclick="tdPagedMove(1)">下一页</button></div>';
 }
 const table=tdPagedTables[id],saved=table?data[table]:null;
 if(table)data[table]=[];
 let html;try{html=tdPagedOriginal[id]()}finally{if(table)data[table]=saved}
 if(id==='customers')html=html.slice(0,html.indexOf('<h2>客户列表'));
 if(id==='orders')html=html.slice(0,html.indexOf('<h2>代买 / 代付订单'));
 if(id==='parcels')html=html.slice(0,html.indexOf('<h2>包裹清单'));
 if(id==='records')return html.replace('oninput="filterRecords()"','oninput="tdPagedSearch(this.value)"').replace('onchange="filterRecords()"','onchange="tdPagedKind(this.value)"').replace('<div id="results"></div>',tdPagedPlaceholder(id));
 if(id!=='customers')html=html.replace(/(<select[^>]*name="customer_id"[^>]*>)[\s\S]*?<\/select>/,(_,tag)=>'<label>搜索客户姓名 / 电话<input autocomplete="off" oninput="tdPagedCustomerSearch(this.value)" placeholder="输入姓名或电话"></label>'+tag+'<option value="">请选择客户</option></select><div id="tdPagedCustomerStatus" role="status"></div>');
 return html+'<h2>'+({customers:'客户列表',orders:'订单列表',parcels:'包裹清单'})[id]+'</h2><label>搜索<input id="tdPagedSearch" autocomplete="off" value="'+esc(tdPagedState(id).term)+'" oninput="tdPagedSearch(this.value)"></label>'+tdPagedPlaceholder(id)+(id==='orders'?'<div id="orderPhotoArea"></div>':id==='parcels'?'<div id="photoArea"></div>':'');
}
customers=()=>tdPagedForm('customers');orders=()=>tdPagedForm('orders');parcels=()=>tdPagedForm('parcels');records=()=>tdPagedForm('records');payments=()=>tdPagedForm('payments');
function tdPagedSearch(term){const state=tdPagedState();state.term=term.trim().slice(0,100);state.offset=0;clearTimeout(tdPaged.timers.get(page));state.token++;const target=page;tdPaged.timers.set(target,setTimeout(()=>{if(page===target){if(tdDataReady)render();else tdPagedLoad(target)}},300))}
function tdPagedKind(kind){const s=tdPagedState();s.kind=kind;s.offset=0;tdPagedLoad(page)}
function tdPagedMove(delta){const s=tdPagedState();s.offset=Math.max(0,s.offset+delta*tdPaged.size);if(tdDataReady)render();else tdPagedLoad(page)}
async function tdPagedCustomerSearch(term){const target=page,epoch=tdPaged.epoch;clearTimeout(tdPaged.timers.get('customer'));tdPaged.timers.set('customer',setTimeout(async()=>{
 const box=$('tdPagedCustomerStatus'),select=document.querySelector('#tdPageContent select[name="customer_id"]');if(!box||!select)return;
 const token=(tdPaged.customerToken||0)+1;tdPaged.customerToken=token;box.textContent='正在搜索…';
 try{const list=await tdScanRpc('td_scan_customers_v57',{p_term:term.trim().slice(0,80)});if(page!==target||epoch!==tdPaged.epoch||token!==tdPaged.customerToken||!box.isConnected)return;
 const value=select.value,selected=data.td_customers.find(x=>x.id===value);data.td_customers=Array.from(new Map([...(selected?[selected]:[]),...list].map(x=>[x.id,x])).values());
 select.innerHTML='<option value="">请选择客户</option>'+data.td_customers.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.name+' '+(x.phone||''))+'</option>').join('');select.value=value;box.textContent=list.length?'请选择客户；未找到时请缩小关键词':'没有匹配客户';
 }catch(e){if(box.isConnected)box.textContent='搜索失败：'+e.message}
 },300))}
async function tdPagedLoad(id){
 const box=$('tdPagedList');if(!box||page!==id||!tdPagedActive(id))return;const s=tdPagedState(id),token=++s.token,epoch=tdPaged.epoch,actor=user?.id;
 box.setAttribute('aria-busy','true');box.innerHTML='<p role="status">正在读取列表…</p>';
 try{
  if(tdPaged.visibility&&Date.now()-tdPaged.visibilityAt>30000)tdPaged.visibility=null;
  if(!tdPaged.visibility){tdPaged.visibilityAt=Date.now();tdPaged.visibility=tdReadVisibility().catch(e=>{tdPaged.visibility=null;throw e})}const visibility=await tdPaged.visibility;
  if(epoch!==tdPaged.epoch||actor!==user?.id)return;tdCommitVisibility(visibility);
  let customerIds=[];
  if(s.term&&id==='records'){
   const found=await tdPagedRequest(db.from('td_customers').select('id').or('name.ilike.'+tdPagedQuote(s.term)+',phone.ilike.'+tdPagedQuote(s.term)).range(0,200));if(found.error)throw found.error;if(found.data?.length>200)throw Error('匹配客户过多，请缩小关键词');customerIds=(found.data||[]).map(x=>x.id);
  }
  const tables=id==='records'?['td_orders','td_parcels','td_pickups']:[tdPagedTables[id]];
  const results=await Promise.all(tables.map(async table=>{
   const field=table==='td_parcels'?'arrived_at':table==='td_pickups'?'picked_at':'created_at';
   let q=db.from(table).select('*').order(field,{ascending:false}).order('id',{ascending:false});
   if(s.term){const fields=table==='td_customers'?['name','phone','notes']:table==='td_orders'?['item_name','notes']:table==='td_parcels'?['tracking_no','description','notes']:['receiver_name','receiver_phone'];
    let filters=fields.map(f=>f+'.ilike.'+tdPagedQuote(s.term));if(customerIds.length)filters.push('customer_id.in.('+customerIds.join(',')+')');q=q.or(filters.join(','));
   }
   const r=await tdPagedRequest(q.range(s.offset,s.offset+tdPaged.size));if(r.error)throw r.error;
   return {table,next:(r.data||[]).length>tdPaged.size,rows:(r.data||[]).slice(0,tdPaged.size).filter(x=>!tdPagedHidden(table,x)).map(x=>({...x,__table:table}))};
  }));
  const rows=results.flatMap(x=>x.rows),names=await tdPagedNames(rows);
  if(epoch!==tdPaged.epoch||actor!==user?.id||token!==s.token||!box.isConnected||page!==id)return;
  for(const result of results)tdPagedRemember(result.table,result.rows);if(id!=='customers')tdPagedRemember('td_customers',names);
  tdCustomerLookup=names; s.rows=rows;s.names=names;s.loadedAt=Date.now();s.next=results.some(x=>x.next);s.loaded=true;tdPagedPaint(id);box.removeAttribute('aria-busy');
 }catch(e){if(box.isConnected&&token===s.token&&epoch===tdPaged.epoch){box.removeAttribute('aria-busy');box.innerHTML='<p role="alert">列表读取失败：'+esc(e.message)+'</p><button class="secondary" onclick="tdPagedLoad(page)">重试</button>'}}
}
function tdPagedPaint(id){
 const box=$('tdPagedList'),s=tdPagedState(id);if(!box)return;
 let content='';
 if(id==='customers')content='<div class="scroll"><table><tr><th>姓名</th><th>电话</th><th>备注</th><th>状态</th><th>管理</th></tr>'+s.rows.map(x=>'<tr><td>'+esc(x.name)+'</td><td>'+esc(x.phone)+'</td><td>'+esc(x.notes)+'</td><td>'+(x.deleted_at?'已删除':archivedCustomers.has(x.id)?'已归档':'正常')+'</td><td>'+(x.deleted_at?(role==='owner'?'<button class="secondary" onclick="restoreDeletedCustomer(\''+esc(x.id)+'\')">恢复</button>':''):((role==='owner'||!archivedCustomers.has(x.id))?'<button class="secondary" onclick="editCustomer(\''+esc(x.id)+'\')">修改</button>':'')+(role==='owner'?'<button class="secondary danger" onclick="softDeleteCustomer(\''+esc(x.id)+'\')">删除</button><button class="secondary" onclick="manageCustomer(\''+(archivedCustomers.has(x.id)?'restore':'archive')+'\',\''+esc(x.id)+'\')">'+(archivedCustomers.has(x.id)?'取消归档':'归档')+'</button>':''))+'</td></tr>').join('')+'</table></div>';
 if(id==='orders'){
  const original=data.td_orders;data.td_orders=s.rows;try{const html=tdPagedOriginal.orders();content=html.slice(html.indexOf('<h2>代买 / 代付订单')).replace('<div id="orderPhotoArea"></div>','')}finally{data.td_orders=original}
 }
 if(id==='parcels')content=listParcels(s.rows).replace('<div id="photoArea"></div>','');
 if(id==='records')content='<div class="scroll"><table><tr><th>类型</th><th>姓名</th><th>内容</th><th>数量</th>'+(role==='owner'?'<th>管理</th>':'')+'</tr>'+s.rows.filter(x=>!s.kind||s.kind===(x.__table==='td_orders'?orderType(x):x.__table==='td_parcels'?'包裹':'取件')).map(x=>'<tr><td>'+esc(x.__table==='td_orders'?orderType(x):x.__table==='td_parcels'?'包裹':'取件')+'</td><td>'+esc(x.customer_id?name(x.customer_id):x.receiver_name)+'</td><td>'+esc(x.item_name||x.tracking_no||x.description||x.receiver_phone)+'</td><td>'+esc(x.quantity||x.pieces||'')+'</td>'+(role==='owner'?'<td><button class="secondary danger" onclick="tdDeleteHistoricalRecord(\''+x.__table+'\',\''+esc(x.id)+'\')">删除</button></td>':'')+'</tr>').join('')+'</table></div>';
 box.innerHTML=content+'<div class="td-action-row"><button class="secondary" '+(!s.offset?'disabled':'')+' onclick="tdPagedMove(-1)">上一页</button><span>第 '+(s.offset/tdPaged.size+1)+' 页</span><button class="secondary" '+(!s.next?'disabled':'')+' onclick="tdPagedMove(1)">下一页</button></div><p class="muted">'+(id==='records'?'每类':'每页')+'最多50条；隐藏记录不显示，统计报表另行完整读取。</p>';
}
filterRecords=function(){if(tdPagedActive('records')){const s=tdPagedState('records');s.kind=$('recordKind')?.value||'';tdPagedPaint('records');return}return tdPagedOriginal.filterRecords()};
filterOrderRows=function(){return tdPagedOriginal.filterOrderRows()};
// Related orders require ALL records for the selected customer, including multi-order links.
let tdPagedRelationToken=0;
tdParcelOrderChoices=function(){
 if(tdDataReady)return tdPagedOriginal.tdParcelOrderChoices();
 const customer=$('tdParcelCustomer')?.value,box=$('tdParcelOrderChoices');if(!box)return;if(!customer){box.textContent='请选择客户';return}
 const token=++tdPagedRelationToken,epoch=tdPaged.epoch;box.textContent='正在读取关联订单…';
 const read=async table=>{const rows=[];for(let offset=0;offset<50000;offset+=1000){const r=await tdPagedRequest(db.from(table).select('*').eq('customer_id',customer).order('id').range(offset,offset+999));if(r.error)throw r.error;rows.push(...(r.data||[]));if((r.data||[]).length<1000)return rows}throw Error('关联记录过多，请联系管理员')};
 Promise.all([read('td_orders'),read('td_parcels'),tdPaged.visibility||tdReadVisibility()]).then(([orders,parcels,visibility])=>{
  if(epoch!==tdPaged.epoch||token!==tdPagedRelationToken||!box.isConnected||$('tdParcelCustomer')?.value!==customer)return;tdCommitVisibility(visibility);
  data.td_orders=orders.filter(x=>!tdPagedHidden('td_orders',x));data.td_parcels=parcels.filter(x=>!tdPagedHidden('td_parcels',x));const count=$('tdParcelPieces'),manual=count?.dataset.manual==='1',value=count?.value;tdPagedOriginal.tdParcelOrderChoices();if(manual&&count){count.value=value;count.dataset.manual='1'}
 }).catch(e=>{if(box.isConnected&&token===tdPagedRelationToken)box.textContent='关联订单读取失败：'+e.message});
};
function tdPagedMount(){if(!tdPagedActive())return;const state=tdPagedState();if(state.loaded&&Date.now()-state.loadedAt<30000){
 for(const table of (page==='records'?['td_orders','td_parcels','td_pickups']:[tdPagedTables[page]]))tdPagedRemember(table,state.rows.filter(x=>x.__table===table));
 if(page!=='customers')tdPagedRemember('td_customers',state.names||[]);tdCustomerLookup=state.names||[];tdPagedPaint(page);
 }else tdPagedLoad(page)}
