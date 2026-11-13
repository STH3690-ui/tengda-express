"""Chromium interaction regression. Mocked transport; SQL is tested separately in test Supabase."""
from pathlib import Path
import os
import shutil
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
STUB=r"""
window.__calls=[];
const at='2026-11-12T00:00:00Z';
window.__rows={td_customers:[{id:'c',name:'测试客户',created_at:at}],td_orders:[{id:'o',customer_id:'c',item_name:'测试订单',total_price:100,created_at:at}],td_parcels:[{id:'parcel',customer_id:'c',pieces:2,remaining:1,arrived_at:at}],td_pickups:[{id:'pickup',parcel_id:'parcel',pieces:1,picked_at:at}],td_payments:[1,2,3].map(i=>({id:'p'+i,amount:10,created_at:at})),td_members:[]};
window.supabase={createClient(){
 const query=rows=>{let start=0,end=999;const q={select(){return q},order(){return q},range(a,b){start=a;end=b;return q},limit(){return q},eq(){return q},async maybeSingle(){return {data:{role:'owner',active:true,display_name:'测试管理员'}}},then(resolve){return Promise.resolve({data:rows.slice(start,end+1)}).then(resolve)}};return q};
 const hidden=()=>JSON.parse(localStorage.getItem('v54hidden')||'[]');
 return {auth:{async getSession(){return {data:{session:null}}},async signOut(){}},
 from(t){return query(t==='td_audit_hidden_v52'?hidden().map(x=>({source_table:x.table,source_id:x.id})):window.__rows[t]||[])},
 rpc(name,args){if(name==='td_hide_audit_batch_v54'){window.__calls.push({name,args});localStorage.setItem('v54hidden',JSON.stringify([...hidden(),...args.p_entries]));return Promise.resolve({data:args.p_entries.length})}return query(hidden().map(x=>({source_table:x.table,source_id:x.id})))}};
}};
"""
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_EXECUTABLE') or shutil.which('chromium'),headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1200,'height':900})
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    def route(req):
        url=req.request.url
        if '/vendor/supabase-' in url:req.fulfill(status=200,content_type='text/javascript',body=STUB)
        elif url.startswith('https://station.test/'):
            path=ROOT/(url.split('https://station.test/',1)[1].split('?',1)[0] or 'index.html')
            if path.is_file():req.fulfill(path=str(path))
            else:req.fulfill(status=404,body='')
        else:req.abort()
    page.route('**/*',route)
    page.goto('https://station.test/')
    def show():
        page.evaluate("async()=>{user={id:'owner'};role='owner';document.getElementById('app').classList.remove('hidden');document.getElementById('auth').classList.add('hidden');await refresh();tdNavigate('staffAudit')}")
    show()
    assert page.locator('#tdAuditResults input[type=checkbox]').count()==7
    page.locator('#tdAuditResults input[type=checkbox]').nth(0).check()
    page.locator('#tdAuditResults input[type=checkbox]').nth(1).check()
    def accept(dialog):dialog.accept('测试删除原因' if dialog.type=='prompt' else None)
    page.on('dialog',accept)
    page.get_by_role('button',name='批量删除已选（2）',exact=True).click()
    page.wait_for_function('window.__calls.length===1 && tdAuditRows().length===5')
    assert page.evaluate('window.__calls[0].args.p_entries.length')==2
    page.reload();show()
    assert page.locator('#tdAuditResults input[type=checkbox]').count()==5
    page.locator('#tdAuditResults').get_by_role('button',name='删除',exact=True).first.click()
    page.wait_for_function('tdAuditRows().length===4')
    page.get_by_role('button',name='全选当前筛选全部记录',exact=True).click()
    page.get_by_role('button',name='批量删除已选（4）',exact=True).click()
    page.wait_for_function('tdAuditRows().length===0')
    page.reload();show()
    assert page.locator('#tdAuditResults input[type=checkbox]').count()==0
    assert page.evaluate('data.td_payments.length')==0
    assert page.evaluate('window.__rows.td_payments.length')==3
    assert not errors,errors
    browser.close()
    print('PASS Chromium: multiselect, single, select-all, immediate disappearance, full reload persistence, original transport rows retained. Transport mocked.')
