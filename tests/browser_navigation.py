"""Navigation/brand regression with mocked business responses; never writes production data."""
import ast,shutil,json,os
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
tree=ast.parse((ROOT/'tests/browser_history_relations.py').read_text())
STUB=next(ast.literal_eval(n.value) for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='STUB' for t in n.targets))
STUB=STUB.replace('td_members:[]', "td_members:[{id:'owner',role:'owner',active:true,display_name:'管理员'},{id:'staff1',role:'staff',active:true,display_name:'员工',permissions:{customer_create:true,order_create:true,parcel_create:true,pickup_create:true,finance_view:true,audit_view:true}}],td_station_addresses:[{id:'st',name_zh:'木姐站',is_active:true}]")
STUB=STUB.replace("role:'owner',active:true", "role:window.__testRole||'owner',active:true")
STUB=STUB.replace('return {auth:',"return {storage:{from(){return {async list(){return {data:[]}},async createSignedUrl(){return {data:{signedUrl:'https://station.test/icon-512.png'}}}}}},auth:",1)
with sync_playwright() as p:
    engine=os.environ.get('TD_BROWSER_ENGINE','chromium')
    options={'executable_path':shutil.which('chromium'),'args':['--no-sandbox']} if engine=='chromium' else {}
    browser=getattr(p,engine).launch(headless=True,**options)
    pg=browser.new_page(viewport={'width':390,'height':844});errors=[];pg.on('pageerror',lambda e:errors.append(str(e)))
    def route(r):
        u=r.request.url
        if '/vendor/supabase-' in u:r.fulfill(status=200,content_type='text/javascript',body=STUB)
        elif u.startswith('https://station.test/'):
            f=ROOT/(u.split('https://station.test/',1)[1].split('?',1)[0] or 'index.html')
            r.fulfill(path=str(f)) if f.is_file() else r.fulfill(status=404,body='')
        else:r.abort()
    pg.route('**/*',route);pg.goto('https://station.test/')
    def start():pg.evaluate("async()=>{window.__testRole='owner';user={id:'owner'};role='owner';document.getElementById('app').classList.remove('hidden');document.getElementById('auth').classList.add('hidden');await refresh()}")
    start();pg.wait_for_url('**/#/home');assert pg.locator('.td-function-grid [data-route]').count()==14
    assert pg.locator('nav').count()==0
    # All root destinations remain reachable; the top-left home control is always present.
    ids=pg.locator('.td-function-grid [data-route]').evaluate_all('(xs)=>xs.map(x=>x.dataset.route)')
    for target in ids:
        pg.locator(f'.td-function-grid [data-route="{target}"]').click();pg.wait_for_url('**/#/'+target)
        pg.locator('.td-page-backbar').get_by_role('button',name='返回主页',exact=True).click();pg.wait_for_url('**/#/home')
    pg.locator('[data-route=customers]').click();name=pg.locator('#customerForm [name=name]');name.fill('尚未保存')
    # In-memory draft survives foreground/authoritative data refresh.
    pg.evaluate('refresh()');assert name.input_value()=='尚未保存'
    dialogs=[]
    def dismiss(d):dialogs.append(d.message);d.dismiss()
    pg.on('dialog',dismiss);pg.get_by_role('button',name='返回主页',exact=True).click();assert name.input_value()=='尚未保存'
    pg.evaluate('history.back()');pg.wait_for_function("!tdNav.reverting && location.hash==='#/customers'");assert pg.url.endswith('#/customers');assert name.input_value()=='尚未保存'
    pg.remove_listener('dialog',dismiss)
    def accept(d):dialogs.append(d.message);d.accept()
    pg.on('dialog',accept);pg.evaluate('history.back()');pg.wait_for_function("page==='home' && !tdNav.reverting");pg.remove_listener('dialog',accept)
    assert len(dialogs)==3,dialogs
    pg.evaluate('history.forward()');pg.wait_for_url('**/#/customers');assert name.input_value()==''
    # Customer edit and hardware/browser back return to the list route, never to another business.
    pg.get_by_role('button',name='修改',exact=True).click();pg.wait_for_url('**/#/customers/edit/c');assert name.input_value()=='共享客户';assert not pg.evaluate('tdHasUnsaved()')
    pg.get_by_role('button',name='返回上一页',exact=True).click();pg.wait_for_url('**/#/customers')
    # Successful save clears the guard, failed navigation retains draft. Mock only this API call.
    name.fill('已保存测试');pg.evaluate("window.__db=db;window.__refresh=refresh;db={from(){return {insert(){return this},then(resolve){window.__resolveSave=()=>resolve({error:null})}}}};refresh=async()=>{render();return true}")
    pg.get_by_role('button',name='保存客户',exact=True).click();pg.wait_for_function('tdNav.pending===1');pg.get_by_role('button',name='返回主页',exact=True).click();assert pg.url.endswith('#/customers');pg.evaluate('window.__resolveSave()');pg.wait_for_function('!tdHasUnsaved() && tdNav.pending===0');pg.evaluate('db=window.__db;refresh=window.__refresh')
    pg.get_by_role('button',name='返回主页',exact=True).click()
    pg.locator('[data-route=stations]').click();pg.get_by_role('button',name='编辑',exact=True).click();pg.wait_for_url('**/#/stations/edit/st');pg.wait_for_function("document.getElementById('tdStationForm').elements.name_zh.value==='木姐站'")
    pg.get_by_role('button',name='返回上一页',exact=True).click();pg.wait_for_url('**/#/stations');pg.get_by_role('button',name='返回主页',exact=True).click()
    pg.locator('[data-route=staff]').click();pg.get_by_role('button',name='分类授权',exact=True).click();pg.wait_for_url('**/#/staff/permissions/staff1');pg.get_by_role('button',name='全部授权',exact=True).click();assert pg.evaluate('tdHasUnsaved()')
    pg.on('dialog',accept);pg.get_by_role('button',name='返回上一页',exact=True).click();pg.wait_for_url('**/#/staff');pg.remove_listener('dialog',accept);pg.get_by_role('button',name='返回主页',exact=True).click()
    pg.locator('[data-route=orders]').click();pg.get_by_role('button',name='查看/添加图片',exact=True).first.click();pg.wait_for_url('**/#/orders/photos/o1');pg.locator('#moreOrderPhotos').set_input_files(str(ROOT/'icon-512.png'));assert pg.evaluate('tdHasUnsaved()')
    pg.evaluate('refresh()');assert pg.locator('#moreOrderPhotos').evaluate('(e)=>e.files.length')==1
    pg.on('dialog',accept);pg.get_by_role('button',name='返回主页',exact=True).click();pg.wait_for_url('**/#/home');pg.remove_listener('dialog',accept)
    # Staff-specific menu: server remains authoritative; UI never exposes owner-only links.
    pg.evaluate("window.__testRole='staff';user={id:'staff1'};role='staff';data.td_members.find(x=>x.id==='staff1').permissions={customer_create:true};render()")
    assert pg.locator('[data-route=staff]').count()==0;assert pg.locator('[data-route=management]').count()==0;assert pg.locator('[data-route=finance]').count()==0
    pg.evaluate("tdNavigate('staff')");assert pg.url.endswith('#/home')
    pg.evaluate("window.__testRole='owner';user={id:'owner'};role='owner';render()")
    # Browser unload protection and pending writes use the same guard without bypassing business APIs.
    pg.locator('[data-route=customers]').click();pg.locator('#customerForm [name=name]').fill('待保存')
    assert pg.evaluate("(()=>{const e=new Event('beforeunload',{cancelable:true});window.dispatchEvent(e);return e.defaultPrevented})()")
    pg.on('dialog',accept);pg.get_by_role('button',name='返回主页',exact=True).click();pg.remove_listener('dialog',accept)
    # Exact column counts and complete page/button layout coverage.
    checks=[]
    for w,h,cols in [(320,640,3),(390,844,3),(844,390,4),(768,1024,4),(1024,768,5),(1280,800,5)]:
        pg.set_viewport_size({'width':w,'height':h})
        assert pg.locator('.td-function-grid').evaluate('(e)=>getComputedStyle(e).gridTemplateColumns.split(" ").length')==cols
        for target in ids+['payments','deletions','cleanup']:
            # WebKit limits history writes to 100 per 10 seconds; keep real navigation checks below that rate.
            pg.evaluate('(id)=>tdNavigate(id)',target);pg.wait_for_timeout(300)
            assert pg.locator('.td-page-backbar .td-home-back').count()==1
            assert pg.locator('body').evaluate('(e)=>e.scrollWidth<=innerWidth'),(w,h,target)
            if target=='deletions':
                pg.locator('.td-history-card input').first.check();pg.get_by_role('button',name='删除已选（1）',exact=True).click()
                box=pg.locator('dialog[open]').bounding_box();assert box['x']>=0 and box['y']>=0 and box['width']<=w and box['height']<=h
                color=pg.locator('#tdHistorySubmit').evaluate('(e)=>getComputedStyle(e).color');assert color=='rgb(163, 35, 35)',color
                pg.get_by_role('button',name='取消',exact=True).click()
            assert pg.locator('button:visible').evaluate_all('(xs)=>xs.every(x=>x.getBoundingClientRect().height>=43)'),(w,h,target)
            pg.evaluate("tdNavigate('home')");checks.append([w,h,target])
        if w in (390,768,1280):pg.screenshot(path=f'/tmp/tengda-home-{w}.png',full_page=True)
    assert not errors,errors
    browser.close();print(json.dumps({'engine':engine,'root_entries':len(ids),'layout_page_combinations':len(checks),'history_cancel_accept_forward':True,'detail_routes':4,'draft_refresh_and_save':True,'staff_permissions':True,'page_errors':errors},ensure_ascii=False))
