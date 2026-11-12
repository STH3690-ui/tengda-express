"""Mobile Chromium regression; all transport mocked. Real SQL tested in separate test project."""
from pathlib import Path
import shutil
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
STUB=r"""
const at='2026-11-12T00:00:00Z';window.__calls=[];
const rows={td_customers:[{id:'c',name:'共享客户',created_at:at}],td_orders:[1,2,3].map(i=>({id:'o'+i,customer_id:'c',item_name:'订单'+i,created_at:at,total_price:100})),td_parcels:[1,2,3].map(i=>({id:'p'+i,customer_id:'c',order_id:'o'+i,pieces:2,remaining:1,arrived_at:at})),td_payments:[1,2,3].map(i=>({id:'m'+i,customer_id:'c',order_id:'o'+i,amount:100,created_at:at})),td_pickups:[],td_members:[]};
const hidden=()=>JSON.parse(localStorage.getItem('v55')||'[]');
const query=a=>{let start=0,end=999;const q={select(){return q},order(){return q},eq(){return q},range(a,b){start=a;end=b;return q},limit(){return q},async maybeSingle(){return {data:{role:'owner',active:true}}},then(resolve){return Promise.resolve({data:a.slice(start,end+1)}).then(resolve)}};return q};
window.supabase={createClient(){return {auth:{async getSession(){return {data:{session:null}}},async signOut(){}},from(t){if(t==='td_order_deletion_log')return query([1,2,3].map(i=>({id:i,order_id:'o'+i,deleted_at:at,snapshot:rows.td_orders[i-1]})));if(t==='td_audit_hidden_v52')return query(hidden());return query(rows[t]||[])},rpc(name,args){window.__calls.push({name,args});if(name==='td_preview_history_delete_v55'){const records=args.p_entries.flatMap(e=>{const i=e.id.slice(1);return [{table:'td_orders',id:e.id,remove:true,snapshot:{item_name:'订单'+i}},{table:'td_parcels',id:'p'+i,remove:true,why:'专属包裹'},{table:'td_payments',id:'m'+i,remove:true,why:'订单外键'}]});records.push({table:'td_customers',id:'c',remove:false,why:'共享客户保留'});window.__plan=records;return Promise.resolve({data:{token:'bound-token',records}})}if(name==='td_confirm_history_delete_v55'){if(args.p_confirmation!=='确认关联删除')return Promise.resolve({error:{message:'confirmation required'}});const a=window.__plan.filter(x=>x.remove).map(x=>({source_table:x.table,source_id:x.id}));localStorage.setItem('v55',JSON.stringify([...hidden(),...a]));return Promise.resolve({data:{deleted:a.length}})}return query(hidden())}}}};
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
    def show():page.evaluate("async()=>{user={id:'owner'};role='owner';document.getElementById('app').classList.remove('hidden');document.getElementById('auth').classList.add('hidden');page='deletions';await refresh();await loadDeletionLogs()}")
    page.goto('https://station.test/');show()
    assert page.locator('.td-history-card').count()==3
    page.get_by_role('button',name='删除 · 预览关联',exact=True).first.click()
    page.get_by_text('共享客户保留',exact=False).wait_for()
    page.get_by_role('button',name='取消',exact=True).click()
    assert page.evaluate("localStorage.getItem('v55')") is None
    page.locator('.td-history-card input').nth(0).check();page.locator('.td-history-card input').nth(1).check()
    page.get_by_role('button',name='预览批量删除（2）',exact=True).click()
    page.locator('#tdHistoryReason').fill('测试关联清理')
    page.locator('#tdHistoryConfirm').fill('确认关联删除')
    page.get_by_role('button',name='确认关联删除',exact=True).click()
    page.wait_for_function('data.td_orders.length===1 && data.td_parcels.length===1 && data.td_payments.length===1')
    page.reload();show()
    assert page.evaluate('data.td_orders.length')==1
    assert page.evaluate('data.td_customers.length')==1
    page.get_by_role('button',name='全选全部记录',exact=True).click()
    page.get_by_role('button',name='预览批量删除（3）',exact=True).click()
    page.locator('#tdHistoryReason').fill('测试全选清理');page.locator('#tdHistoryConfirm').fill('确认关联删除')
    page.get_by_role('button',name='确认关联删除',exact=True).click()
    page.wait_for_function('data.td_orders.length===0')
    page.reload();show()
    assert page.evaluate('data.td_orders.length')==0
    assert page.locator('body').evaluate('(el)=>el.scrollWidth<=window.innerWidth')
    assert page.locator('.td-history-card button').first.bounding_box()['height']>=44
    page.screenshot(path='/tmp/v55-mobile-history.png',full_page=True)
    assert not errors,errors
    browser.close()
    print('PASS mobile Chromium: single preview/cancel, multi/all confirmation, protected customer, immediate filtering, full reload persistence, no horizontal overflow, 44px controls. Transport mocked.')
