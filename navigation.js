/* Presentation-only navigation. No database calls, RLS or financial/deletion calculations. */
'use strict';
const TD_NAV_ITEMS=[
 ['customers','客户','users','客户资料与往来'],['parcels','包裹','box','入库登记与照片'],
 ['pickups','到站取件','truck','取件、结算与欠款'],['orders','订单','bag','代买代付登记'],
 ['finance','收款欠款','money','流水、欠款与还款'],['dashboard','统计报表','chart','经营概览与导出'],
 ['records','历史记录','list','查询业务记录'],['entry','员工录入','edit','日常业务快捷登记'],
 ['staff','员工管理','shield','账号审核与授权'],['staffAudit','录入明细','user','按员工查看录入'],
 ['management','记录管理','archive','删除历史与归档'],['query','包裹查询','search','客户待取及已取'],
 ['scan','智能扫码','scan','入库、查询与连续取件'],
 ['stations','站点地址','pin','查看与维护站点'],['settings','系统设置','lock','本设备偏好与账号']
];
const TD_NAV_OWNER=new Set(['staff','staffAudit','management','deletions','cleanup']);
const tdNav={pending:0,route:{page:'home'},index:0,started:false,reverting:false,renderKey:'',baseline:new Map(),selection:'{}',signature:'',skipDraft:false};
const tdOriginalViews={editCustomer,tdEditStation,tdPermissionsPanel,openPhotos,openOrderPhotos,cancelCustomerEdit};
function tdNavPermission(key){const m=data.td_members.find(x=>x.id===user?.id);return role==='owner'||!!(m?.active&&!m.deleted_at&&m.permissions?.[key]===true)}
function tdCanOpen(id){
 if(!user||!role)return false;
 if(id==='scanIntake')return tdNavPermission('parcel_create');
 if(id==='scanPickup')return tdNavPermission('pickup_create');
 if(['scan','scanQuery','scanHistory'].includes(id))return true;
 if(TD_NAV_OWNER.has(id))return role==='owner';
 if(['finance','payments','dashboard'].includes(id))return ['finance_view','finance_create','finance_edit','finance_export'].some(tdNavPermission);
 if(id==='pickups')return ['pickup_create','pickup_edit','finance_view'].some(tdNavPermission);
 if(id==='records')return tdNavPermission('audit_view');
 return ['home','customers','orders','parcels','query','stations','settings','entry'].includes(id);
}
function tdVisibleNav(){return TD_NAV_ITEMS.filter(x=>tdCanOpen(x[0]))}
function tdNavIcon(kind){return tdIconHTML(kind)}
function tdNavTitle(id){return TD_NAV_ITEMS.find(x=>x[0]===id)?.[1]||({home:'导航主页',scanIntake:'扫码入库',scanQuery:'扫码查询',scanPickup:'扫码取件',scanHistory:'扫码记录',payments:'收付款流水',deletions:'删除历史',cleanup:'过期清理'})[id]||'导航主页'}
function tdNavCard(item){return '<button type="button" class="td-function-card" data-route="'+item[0]+'" onclick="tdNavigate(\''+item[0]+'\')">'+tdNavIcon(item[2])+'<span>'+esc(item[1])+'</span><small>'+esc(item[3])+'</small></button>'}
function tdHomePage(){
 const customers=data.td_customers.filter(x=>!x.deleted_at).length;
 const remaining=data.td_parcels.reduce((s,x)=>s+Math.max(0,Number(x.remaining)||0),0);
 const orders=data.td_orders.filter(x=>!hiddenOrderIds.has(x.id)).length;
 return '<section class="td-home-heading"><div><p class="td-eyebrow">TENG DA · WORKSPACE</p><h2>工作主页</h2><p class="muted">'+(role==='owner'?'管理员工作台':'员工工作台')+' · 选择功能开始办理</p></div><span class="td-brand-speed" aria-hidden="true"></span></section>'+
 '<section class="td-home-overview" aria-label="简洁经营概览"><div><span>当前客户</span><b>'+customers+'<small> 人</small></b></div><div><span>待取件数</span><b>'+remaining+'<small> 件</small></b></div><div><span>有效订单</span><b>'+orders+'<small> 单</small></b></div></section>'+
 (tdNavPermission('parcel_create')?'<button class="td-live-launch" onclick="tdNavigate(\'scanIntake\')"><strong>高清拍照入库</strong><span>手动快门 · 原始高清 · 本机识别</span></button>':'')+
 '<h3 class="td-functions-title">全部功能</h3><section class="td-function-grid" aria-label="全部功能">'+tdVisibleNav().map(tdNavCard).join('')+'</section>';
}
function tdNavLinks(items){return '<section class="td-hub-grid">'+items.filter(x=>tdCanOpen(x[0])).map(tdNavCard).join('')+'</section>'}
function tdFinanceHub(){return '<h2>收款与欠款</h2>'+tdNavLinks([['payments','收付款流水','money','登记与查看收付款'],['pickups','欠款与还款','truck','取件页面查看实际余额']])}
function tdEntryHub(){const links=[['customers','新增客户','users','客户登记','customer_create'],['parcels','包裹入库','box','到站登记','parcel_create'],['orders','录入订单','bag','代买代付','order_create'],['pickups','办理取件','truck','取件与结算','pickup_create'],['payments','登记收付款','money','收款付款流水','finance_create']].filter(x=>tdNavPermission(x[4]));return '<h2>员工录入</h2><p class="muted">选择已授权的日常业务。</p>'+tdNavLinks(links)+(links.length?'':'<p>当前暂无录入授权，请联系管理员。</p>')}
function tdManagementHub(){return '<h2>记录管理</h2>'+tdNavLinks([['deletions','删除历史','trash','勾选历史并统一处理'],['cleanup','过期归档','archive','预览并归档过期记录'],['records','业务查询','search','搜索现有业务记录']])}
function tdSettingsPage(){return '<h2>系统设置</h2><section class="photo-box"><h3>腾达快递站 V62.2</h3><p>'+esc(role==='owner'?'管理员':'员工')+' · '+esc(data.td_members.find(x=>x.id===user?.id)?.display_name||user?.email||'已登录')+'</p><label><input type="checkbox" id="tdLargeText" '+(document.documentElement.classList.contains('td-large-text')?'checked':'')+' onchange="tdSetLargeText(this.checked)"> 大字显示</label></section><div class="td-action-row"><button class="secondary" onclick="tdRefreshSafely()">刷新云数据</button>'+(role==='owner'?'<button class="secondary" onclick="tdNavigate(\'staff\')">账号与权限</button>':'')+'<button class="secondary danger" onclick="logout()">退出登录</button></div>'}
function tdSetLargeText(on){document.documentElement.classList.toggle('td-large-text',on);try{localStorage.setItem('td-ui-large-text',on?'1':'0')}catch{}}
function tdParseRoute(hash){
 const text=String(hash||'').replace(/^#\/?/,'');const parts=text.split('/').map(x=>{try{return decodeURIComponent(x)}catch{return ''}});
 const id=parts[0]||'home';if(!['home','finance','entry','management','settings',...TD_SCAN_PAGES,...tabs.map(x=>x[0])].includes(id))return {page:'home'};
 const route={page:id};if(parts.length===3&&({customers:['edit'],stations:['edit'],staff:['permissions'],parcels:['photos'],orders:['photos']}[id]||[]).includes(parts[1])&&/^[\w-]{1,80}$/.test(parts[2])){route.view=parts[1];route.id=parts[2]}
 return route;
}
function tdRouteHash(route){return '#/'+route.page+(route.view?'/'+route.view+'/'+encodeURIComponent(route.id):'')}
function tdRouteKey(route){return tdRouteHash(route)}
function tdStartNavigation(){
 if(tdNav.started)return;tdNav.started=true;tdNav.route=tdParseRoute(window.location.hash);page=tdNav.route.page;
 tdNav.index=Number.isInteger(window.history.state?.tdIndex)?window.history.state.tdIndex:0;
 window.history.replaceState({tdNav:true,tdIndex:tdNav.index,route:tdNav.route},'',tdRouteHash(tdNav.route));
}
function tdResetNavigation(){tdScanLeave();tdNav.pending=0;tdNav.started=false;tdNav.renderKey='';tdNav.baseline.clear();tdNav.selection='{}';tdNav.signature='';tdNav.skipDraft=true}
function tdDraftControls(){return Array.from(document.querySelectorAll('#page form input,#page form select,#page form textarea,#tdPermissionEditor input,#pickupKg,#pickupRate,#pickupPaid,#pickupMethod,#pickupReceiver,#pickupPhone,#pickupNotes,#tdDebts input,#tdDebts select,#morePhotos,#moreOrderPhotos'))}
function tdControlKey(el,i){return el.id||el.getAttribute('data-permission')||el.getAttribute('data-group')||((el.form?.id||el.form?.getAttribute('onsubmit')||'field')+':'+el.name+':'+i)}
function tdControlValue(el){if(el.type==='file')return Array.from(el.files||[]).map(x=>x.name+':'+x.size+':'+x.lastModified).join('|');return /^(checkbox|radio)$/.test(el.type)?el.checked:String(el.value)}
function tdDefaultValue(el){if(el.type==='file')return '';if(/^(checkbox|radio)$/.test(el.type))return el.defaultChecked;if(el.tagName==='SELECT')return Array.from(el.options).find(x=>x.defaultSelected)?.value||el.options[0]?.value||'';return String(el.defaultValue||'')}
function tdCaptureBaseline(){tdNav.baseline=new Map(tdDraftControls().map((e,i)=>[tdControlKey(e,i),tdControlValue(e)]));tdNav.selection=JSON.stringify(pickupSelected);tdNav.signature=signature;tdNav.skipDraft=false}
function tdHasUnsaved(){return tdScanDirty()||tdDraftControls().some((e,i)=>tdControlValue(e)!==(tdNav.baseline.has(tdControlKey(e,i))?tdNav.baseline.get(tdControlKey(e,i)):tdDefaultValue(e)))||(page==='pickups'&&JSON.stringify(pickupSelected)!==tdNav.selection)||signature!==tdNav.signature}
function tdAllowLeave(){if(tdNav.pending){notify('正在提交，请等待完成后离开',true);return false;}return !tdHasUnsaved()||window.confirm('有尚未保存的内容，确定离开并放弃修改吗？')}
function tdCaptureDraft(){return new Map(tdDraftControls().map((e,i)=>[tdControlKey(e,i),{value:e.value,checked:e.checked,node:e.type==='file'?e:null}]))}
function tdRestoreDraft(draft){tdDraftControls().forEach((e,i)=>{const saved=draft.get(tdControlKey(e,i));if(!saved)return;if(saved.node)e.replaceWith(saved.node);else{e.value=saved.value;e.checked=saved.checked}})}
function tdDiscardPageState(){tdScanLeave();editingCustomerId=null;pickupSelected={};signature='';tdNav.baseline.clear();tdNav.signature='';tdNav.selection='{}';tdNav.renderKey='';tdNav.skipDraft=true}
function tdNavigate(target){
 if(tdNav.reverting)return;
 const route=typeof target==='string'?{page:target}:target;
 if(!tdCanOpen(route.page))return notify('当前账号没有此功能权限',true);
 if(tdRouteKey(route)===tdRouteKey(tdNav.route))return;
 if(!tdAllowLeave())return;
 $('msg')?.classList.add('hidden');tdDiscardPageState();tdNav.route=route;page=route.page;tdNav.index++;
 window.history.pushState({tdNav:true,tdIndex:tdNav.index,route},'',tdRouteHash(route));render();window.scrollTo({top:0});
}
function tdBack(){if(tdNav.reverting)return;if(tdNav.index>0)window.history.back();else tdNavigate('home')}
function tdOnPopState(event){
 if(!user)return;
 const route=tdParseRoute(window.location.hash),next=Number.isInteger(event.state?.tdIndex)?event.state.tdIndex:0;
 if(tdNav.reverting){if(tdRouteKey(route)===tdRouteKey(tdNav.route)&&next===tdNav.index)tdNav.reverting=false;else if(next!==tdNav.index)window.history.go(tdNav.index-next);return;}
 if(tdRouteKey(route)===tdRouteKey(tdNav.route))return;
 if(!tdAllowLeave()){tdNav.reverting=true;window.history.go(tdNav.index-next||1);return;}
 $('msg')?.classList.add('hidden');tdDiscardPageState();tdNav.route=tdCanOpen(route.page)?route:{page:'home'};tdNav.index=next;page=tdNav.route.page;
 if(page!==route.page)window.history.replaceState({tdNav:true,tdIndex:next,route:tdNav.route},'',tdRouteHash(tdNav.route));render();window.scrollTo({top:0});
}
function tdUiSaved(){
 tdNav.skipDraft=true;tdNav.baseline.clear();tdNav.signature=signature;tdNav.selection=JSON.stringify(pickupSelected);
 if(tdNav.route.view==='edit'||tdNav.route.view==='permissions'){tdNav.route={page:page};window.history.replaceState({tdNav:true,tdIndex:tdNav.index,route:tdNav.route},'',tdRouteHash(tdNav.route));const bar=document.querySelector('.td-page-backbar');if(bar)bar.outerHTML=tdPageBackbar(tdNav.route)}
}
async function tdRefreshSafely(){if(!tdAllowLeave())return;tdDiscardPageState();await refresh()}
function tdPageBackbar(route){return '<div class="td-page-backbar"><button class="secondary td-home-back" onclick="tdNavigate(\'home\')">'+tdNavIcon('home')+'<span>返回主页</span></button>'+(route.view||TD_SCAN_PAGES.includes(route.page)?'<button class="secondary" onclick="tdBack()">'+tdNavIcon('back')+'<span>返回上一页</span></button>':'')+'<span class="td-page-crumb">'+esc(tdNavTitle(route.page))+(route.view?' · '+({edit:'编辑',permissions:'权限编辑',photos:'照片详情'})[route.view]:'')+'</span></div>'}
function tdRenderApp(){
 if(!user)return;
 if(tdNav.pending&&!tdNav.skipDraft&&tdHasUnsaved())return;
 if(!tdNav.started)tdStartNavigation();
 // Retain compatibility with existing callers that assign the original page IDs before render().
 if(page!==tdNav.route.page){tdNav.route={page};window.history.replaceState({tdNav:true,tdIndex:tdNav.index,route:tdNav.route},'',tdRouteHash(tdNav.route))}
 if(!tdCanOpen(page)){page='home';tdNav.route={page};window.history.replaceState({tdNav:true,tdIndex:tdNav.index,route:tdNav.route},'',tdRouteHash(tdNav.route))}
 const route={...tdNav.route},key=tdRouteKey(route),draft=tdNav.renderKey===key&&!tdNav.skipDraft&&tdHasUnsaved()?tdCaptureDraft():null;
 const detailBox=route.page==='parcels'?'photoArea':'orderPhotoArea',detailHTML=draft&&route.view==='photos'?$(detailBox)?.innerHTML:null;
 if(tdScanIsPage()&&tdNav.renderKey===key&&$('tdPageContent'))return;
 const root=$('page');document.body.setAttribute('data-td-page',page);$('nav').innerHTML='';
 const views={scan:tdScanPage,scanIntake:tdScanPage,scanQuery:tdScanPage,scanPickup:tdScanPage,scanHistory:tdScanPage,home:tdHomePage,finance:tdFinanceHub,entry:tdEntryHub,management:tdManagementHub,settings:tdSettingsPage,dashboard,customers,orders,parcels,query:parcelQuery,pickups,payments,records,deletions,cleanup:tdCleanupPage,staff,staffAudit:tdStaffAuditPage,stations:tdStationPage};
 root.innerHTML=(page==='home'?'':tdPageBackbar(route))+'<div id="tdPageContent">'+views[page]()+'</div>';
 tdNav.renderKey=key;
 if(tdScanIsPage())tdScanMount();
 if(page==='parcels')tdParcelOrderChoices();
 if(page==='pickups'){loadPickupBatches();tdLoadDebts()}
 if(page==='dashboard')tdLoadFinance();if(page==='query')renderQueryResults();if(page==='records')filterRecords();if(page==='staffAudit')tdAuditRenderResults();if(page==='deletions')loadDeletionLogs();
 if(route.view==='edit'&&page==='customers'){tdOriginalViews.editCustomer(route.id)}
 if(route.view==='permissions'&&page==='staff')tdOriginalViews.tdPermissionsPanel(route.id);
 if(route.view==='photos'){if(detailHTML!==null&&$(detailBox))$(detailBox).innerHTML=detailHTML;else if(page==='parcels')tdOriginalViews.openPhotos(route.id);else if(page==='orders')tdOriginalViews.openOrderPhotos(route.id)}
 if(page==='stations')tdLoadStations().then(()=>{if(tdRouteKey(tdNav.route)!==key)return;if(route.view==='edit'&&!draft){tdOriginalViews.tdEditStation(route.id);tdCaptureBaseline()}});
 tdDecorateFormFields();
 if(draft)tdRestoreDraft(draft);else tdCaptureBaseline();
}
// Existing detail functions remain intact; only their entry/exit navigation is wrapped.
editCustomer=id=>tdNavigate({page:'customers',view:'edit',id});
tdEditStation=id=>tdNavigate({page:'stations',view:'edit',id});
tdPermissionsPanel=id=>tdNavigate({page:'staff',view:'permissions',id});
openPhotos=id=>tdNav.route.page==='parcels'&&tdNav.route.view==='photos'&&tdNav.route.id===id?tdOriginalViews.openPhotos(id):tdNavigate({page:'parcels',view:'photos',id});
openOrderPhotos=id=>tdNav.route.page==='orders'&&tdNav.route.view==='photos'&&tdNav.route.id===id?tdOriginalViews.openOrderPhotos(id):tdNavigate({page:'orders',view:'photos',id});
cancelCustomerEdit=()=>tdNav.route.view==='edit'?tdBack():tdOriginalViews.cancelCustomerEdit();
tdIconPaths.scan='<path d="M3 8V3h5m8 0h5v5M3 16v5h5m8 0h5v-5M7 7v10m3-10v10m4-10v10m3-10v10M2 12h20"/>';
tdIconPaths.home='<path d="m3 11 9-8 9 8M5 10v11h5v-7h4v7h5V10"/>';
tdIconPaths.back='<path d="m10 5-7 7 7 7M3 12h18"/>';
window.addEventListener('popstate',tdOnPopState);
window.addEventListener('hashchange',()=>{if(user&&!tdNav.reverting&&tdRouteHash(tdParseRoute(window.location.hash))!==tdRouteHash(tdNav.route))tdOnPopState({state:window.history.state})});
window.addEventListener('beforeunload',e=>{if(user&&(tdNav.pending||tdHasUnsaved())){e.preventDefault();e.returnValue=''}});
try{if(localStorage.getItem('td-ui-large-text')==='1')document.documentElement.classList.add('td-large-text')}catch{}
function tdCancelStationEdit(){if(tdNav.route.page==='stations'&&tdNav.route.view==='edit')tdBack();else{tdResetStation();tdCaptureBaseline()}}

document.addEventListener('close',event=>{if(event.target.id==='tdHistoryDeleteDialog')event.target.querySelector('form')?.reset()},true);

// Navigation is held while the existing async write handlers finish; their API calls are untouched.
for(const method of ['saveCustomer','submitRow','submitBatchPickup','submitPickup','tdSaveStation','tdSavePermissions','tdRepay','addPhotos','addOrderPhotos','tdHistoryConfirmDelete']){
 const original=window[method];if(typeof original!=='function')continue;
 window[method]=async function(...args){tdNav.pending++;try{return await original.apply(this,args)}finally{tdNav.pending=Math.max(0,tdNav.pending-1)}};
}
