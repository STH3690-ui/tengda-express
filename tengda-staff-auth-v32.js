
/* Teng Da staff username login + registration enhancement; test branch only */
(function(){
  const domain='@staff.tengda.example.com';
  const emailFor=x=>x.includes('@')?x:x.toLowerCase()+domain;
  const reg=document.getElementById('registerForm');
  const login=document.getElementById('loginForm');
  if(!reg||!login)return;
  const emailField=reg.querySelector('[name=email]');
  if(emailField){emailField.outerHTML='<label>用户名（英文字母、数字、下划线）</label><input name="username" required pattern="[A-Za-z0-9_]{3,30}" minlength="3" maxlength="30" autocapitalize="none"><label>联系电话</label><input name="contact_phone" type="tel" required maxlength="30">';}
  const note=reg.querySelector('.muted');if(note)note.textContent='员工无需邮箱，提交申请后由老板审批。';
  const loginInput=login.querySelector('[name=email]');
  if(loginInput){loginInput.type='text';loginInput.previousElementSibling.textContent='用户名或老板邮箱';}
  reg.addEventListener('submit',async function(e){
    e.preventDefault();e.stopImmediatePropagation();
    const btn=reg.querySelector('button');btn.disabled=true;
    try{
      if(!window.db && typeof db==='undefined')throw Error('数据库未连接');
      const f=new FormData(reg),username=String(f.get('username')||'').trim().toLowerCase(),phone=String(f.get('contact_phone')||'').trim(),display_name=String(f.get('display_name')||'').trim();
      if(!/^[a-z0-9_]{3,30}$/.test(username))throw Error('用户名只能使用3–30位英文字母、数字或下划线');
      if(!phone||!display_name)throw Error('请填写姓名和联系电话');
      const {data,error}=await db.auth.signUp({email:emailFor(username),password:String(f.get('password')),options:{data:{display_name,username,contact_phone:phone}}});
      if(error)throw error;
      if(!data?.user)throw Error('注册未返回用户');
      alert('申请已提交，请等待老板批准。');reg.reset();reg.classList.add('hidden');
      if(data.session)await db.auth.signOut();
    }catch(err){alert('申请失败：'+err.message)}finally{btn.disabled=false;}
  },true);
  login.addEventListener('submit',async function(e){
    e.preventDefault();e.stopImmediatePropagation();
    const btn=login.querySelector('button');btn.disabled=true;
    try{
      const f=new FormData(login),value=String(f.get('email')||'').trim();
      const {data,error}=await db.auth.signInWithPassword({email:emailFor(value),password:String(f.get('password'))});
      if(error)throw error;
      if(!data?.user)throw Error('登录失败');
      user=data.user;await enter();
    }catch(err){alert('登录失败：'+err.message)}finally{btn.disabled=false;}
  },true);
})();
