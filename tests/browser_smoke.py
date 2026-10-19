"""Local UI smoke tests with a mocked Supabase client; no remote requests."""
from pathlib import Path
import os
import shutil
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
STUB = r"""
window.__role='staff';window.__active=true;window.__actions=[];
window.supabase={createClient(){return {
 auth:{async getSession(){return {data:{session:null}}},async setSession(){return {data:{user:{id:'staff1'}}}},async signOut(){return {}}},
 functions:{async invoke(name,options){window.__actions.push(options.body);if(options.body.action==='login')return {data:{ok:true,session:{access_token:'access',refresh_token:'refresh'}}};return {data:{ok:true}}}},
 from(table){const q={select(){return q},order(){return q},range(){return q},limit(){return q},eq(){return q},update(){return q},insert(){return q},
 async maybeSingle(){return {data:{role:window.__role,active:window.__active,display_name:'测试员工'}}},
 then(resolve){return Promise.resolve({data:table==='td_customers'?[{id:'c1',name:'测试客户',phone:'123',notes:''}]:table==='td_members'?[{id:'staff1',role:'staff',active:window.__active,display_name:'测试员工',username:'staff_01'}]:[],error:null}).then(resolve)}};return q;},
 rpc:async()=>({data:[],error:null})
}}};
"""
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_EXECUTABLE') or shutil.which('chromium'),headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':390,'height':844})
    errors=[]
    page.on('pageerror',lambda e: errors.append(str(e)))
    def route(request):
        url=request.request.url
        if '@supabase/supabase-js' in url:
            request.fulfill(status=200,content_type='text/javascript',body=STUB)
        elif url.startswith('https://station.test/'):
            path=ROOT/(url.split('https://station.test/',1)[1].split('?',1)[0] or 'index.html')
            if path.is_file():request.fulfill(path=str(path))
            else:request.fulfill(status=404,body='')
        else:request.abort()
    page.route('**/*',route)
    page.goto('https://station.test/')
    page.locator('#auth').wait_for(state='visible')
    page.locator('#loginForm [name=username]').fill('staff_01')
    page.locator('#loginForm [name=password]').fill('safe-password-123')
    page.get_by_role('button',name='登录',exact=True).click()
    page.locator('#app').wait_for(state='visible')
    page.get_by_role('button',name='客户',exact=True).click()
    assert page.get_by_role('button',name='修改',exact=True).count()==1
    assert page.get_by_role('button',name='删除',exact=True).count()==0
    assert page.get_by_role('button',name='归档',exact=True).count()==0
    assert page.get_by_role('button',name='账号管理',exact=True).count()==0
    page.evaluate("window.__role='owner';tdCheckMember().then(()=>render())")
    page.get_by_role('button',name='账号管理',exact=True).click()
    page.locator('#page [name=username]').fill('new_staff')
    page.locator('#page [name=display_name]').fill('新员工')
    page.locator('#page [name=password]').fill('safe-password-123')
    # Email is left blank deliberately; browser validation must allow submission.
    page.get_by_role('button',name='创建账号',exact=True).click()
    page.wait_for_function("window.__actions.some(x=>x.action==='create'&&x.email==='')")
    page.get_by_role('button',name='客户',exact=True).click()
    assert page.get_by_role('button',name='删除',exact=True).count()==1
    assert page.get_by_role('button',name='归档',exact=True).count()==1
    assert page.locator('header.td-hero').is_visible()
    assert page.locator('body').evaluate('(el)=>el.scrollWidth<=window.innerWidth')
    page.evaluate("window.__active=false;tdCheckMember()")
    page.locator('#auth').wait_for(state='visible')
    assert page.locator('#app').is_hidden()
    assert page.locator('#page').inner_html()==''
    assert not errors, errors
    browser.close()
    print('Browser smoke passed: username login, staff restrictions, owner creation without email, owner controls, mobile layout, disabled-session cleanup. All backend responses were mocked.')
