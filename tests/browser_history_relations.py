"""Mobile Chromium regression; all transport mocked. Real SQL tested in separate test project."""
from pathlib import Path
import shutil
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
STUB=r"""
const at='2026-11-12T00:00:00Z';window.__calls=[];window.__mutationCount=0;
const rows={td_customers:[{id:'c',name:'共享客户',created_at:at}],td_orders:[1,2,3].map(i=>({id:'o'+i,customer_id:'c',item_name:'订单'+i,created_at:at,total_price:100})),td_parcels:[1,2,3].map(i=>({id:'p'+i,customer_id:'c',order_id:'o'+i,pieces:2,remaining:1,arrived_at:at})),td_payments:[1,2,3].map(i=>({id:'m'+i,customer_id:'c',order_id:'o'+i,amount:100,created_at:at})),td_pickups:[],td_members:[]};
const hidden=()=>JSON.parse(localStorage.getItem('v56business')||'[]');const histories=()=>JSON.parse(localStorage.getItem('v56history')||'[]');
const query=a=>{let start=0,end=999;const q={select(){return q},order(){return q},eq(){return q},range(a,b){start=a;end=b;return q},limit(){return q},async maybeSingle(){return {data:{role:'owner',active:true}}},then(resolve){return Promise.resolve({data:a.slice(start,end+1)}).then(resolve)}};return q};
window.supabase={createClient(){return {auth:{async getSession(){return {data:{session:null}}},async signOut(){}},from(t){if(t==='td_order_deletion_log')return query([...rows.td_orders.map((o,i)=>({id:i,order_id:o.id,deleted_at:at,snapshot:o})),{id:9,order_id:'gone',deleted_at:at,snapshot:{item_name:'原业务已不存在'}}]);if(t==='td_history_hidden_v56')return query(histories());if(t==='td_business_hidden_v54'||t==='td_audit_hidden_v52')return query(hidden());return query(rows[t]||[])},rpc(name,args){window.__calls.push({name,args});if(name==='td_delete_history_batch_v56'){window.__mutationCount++;const business=args.p_entries.filter(x=>x.id!=='gone').flatMap(e=>{const i=e.id.slice(1);return [{source_table:'td_orders',source_id:e.id},{source_table:'td_parcels',source_id:'p'+i},{source_table:'td_payments',source_id:'m'+i}]});const a=args.p_entries.map(x=>({source_table:x.table,source_id:x.id}));localStorage.setItem('v56business',JSON.stringify([...hidden(),...business]));localStorage.setItem('v56history',JSON.stringify([...histories(),...a,...business]));return Promise.resolve({data:{business_hidden:business.length,history_hidden:a.length+business.length}})}return query(hidden())}}}};
"""
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=shutil.which('chromium'),headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':390,'height':844})
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    def route(req):
        url=req.request.url
        if '/vendor/supabase-' in url:req.fulfill(status=200,content_type='text/javascript',body=STUB)
        elif url.startswith('https://station.test/'):
            path=ROOT/(url.split('https://station.test/',1)[1].split('?',1)[0] or 'index.html')
            if path.is_file():req.fulfill(path=str(path))
            else:req.fulfill(status=404,body='')
        else:req.abort()
    page.route('**/*',route)
    def show():page.evaluate("async()=>{user={id:'owner'};role='owner';document.getElementById('app').classList.remove('hidden');document.getElementById('auth').classList.add('hidden');await refresh();tdNavigate('deletions');await loadDeletionLogs()}")
    page.goto('https://station.test/');show()
    assert page.locator('.td-history-card').count()==4
    assert page.get_by_role('button',name='删除 · 预览关联',exact=True).count()==0
    # One selection opens one modal, cancellation performs no mutation.
    page.locator('.td-history-card input').first.check()
    page.get_by_role('button',name='删除已选（1）',exact=True).click()
    assert page.locator('dialog[open]').count()==1
    page.get_by_role('button',name='取消',exact=True).click()
    assert page.evaluate('window.__mutationCount')==0
    page.locator('.td-history-card input').nth(1).check()
    page.get_by_role('button',name='删除已选（2）',exact=True).click()
    page.locator('#tdHistoryReason').fill('统一删除原因')
    page.get_by_role('button',name='确认删除',exact=True).click()
    page.wait_for_function('tdHistoryRows.length===2')
    assert page.evaluate('window.__mutationCount')==1
    assert page.evaluate("window.__calls.find(x=>x.name==='td_delete_history_batch_v56').args.p_reason")=='统一删除原因'
    page.reload();show()
    assert page.locator('.td-history-card').count()==2
    # All remaining includes the missing-source log, with one reason and one submit.
    page.get_by_label('全选（2）',exact=False).check()
    page.get_by_role('button',name='删除已选（2）',exact=True).click()
    page.locator('#tdHistoryReason').fill('全选统一清理')
    page.get_by_role('button',name='确认删除',exact=True).click()
    page.wait_for_function('tdHistoryRows.length===0')
    page.reload();show()
    assert page.locator('.td-history-card').count()==0
    assert page.evaluate('data.td_orders.length')==0
    assert page.evaluate('data.td_customers.length')==1
    assert page.locator('body').evaluate('(el)=>el.scrollWidth<=window.innerWidth')
    page.screenshot(path='/tmp/v56-mobile-history.png',full_page=True)
    assert not errors,errors
    browser.close()
    print('PASS V56 mobile Chromium: single modal/cancel, multi/all with one shared reason and one RPC, missing-source cleanup, protected customer, immediate disappearance and reload persistence, no horizontal overflow. Transport mocked.')
