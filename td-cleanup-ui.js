/* Teng Da expired-record cleanup UI helpers. Loaded only when integrated into the admin navigation. */
async function tdCleanupPreview(){
  if(role!=='owner') return notify('仅管理员可操作',true);
  const cutoff=$('tdCleanupDate')?.value;
  if(!cutoff) return notify('请先选择截止日期',true);
  const box=$('tdCleanupPreview');
  box.innerHTML='<p class="muted">正在生成预览…</p>';
  const {data:result,error}=await db.rpc('td_cleanup_preview_v1',{p_cutoff_date:cutoff});
  if(error){box.innerHTML='<p class="danger">预览失败：'+esc(error.message)+'。请确认迁移已审核并应用。</p>';return;}
  const orders=result.orders||[], parcels=result.parcels||[];
  box.innerHTML='<div class="metrics"><div class="metric">符合条件订单<b>'+Number(result.orders_count||0)+'</b></div><div class="metric">已取完包裹<b>'+Number(result.parcels_count||0)+'</b></div></div>'+
    '<h3>订单预览</h3><div class="scroll"><table><tr><th>客户</th><th>商品</th><th>状态</th><th>创建时间</th><th>收付款</th><th>关联包裹</th></tr>'+
    (orders.map(x=>'<tr><td>'+esc(name(x.customer_id))+'</td><td>'+esc(x.item_name)+'</td><td>'+esc(x.status)+'</td><td>'+esc(date(x.created_at))+'</td><td>'+(x.has_payments?'有关联（保留）':'无')+'</td><td>'+Number(x.parcel_count||0)+'</td></tr>').join('')||'<tr><td colspan="6">无符合条件订单</td></tr>')+
    '</table></div><h3>包裹预览</h3><div class="scroll"><table><tr><th>客户</th><th>运单</th><th>内容</th><th>总件数</th><th>剩余</th><th>取件记录</th><th>结算批次</th></tr>'+
    (parcels.map(x=>'<tr><td>'+esc(name(x.customer_id))+'</td><td>'+esc(x.tracking_no)+'</td><td>'+esc(x.description)+'</td><td>'+Number(x.pieces||0)+'</td><td>'+Number(x.remaining||0)+'</td><td>'+Number(x.pickup_count||0)+'（保留）</td><td>'+Number(x.batch_count||0)+'（保留）</td></tr>').join('')||'<tr><td colspan="7">无符合条件包裹</td></tr>')+
    '</table></div><p class="muted">仅设置归档标记，不删除原始订单、财务、取件签收或结算记录。</p>'+
    ((orders.length+parcels.length)?'<button class="primary" onclick="tdCleanupExecute(\''+esc(cutoff)+'\')">二次确认并归档</button>':'');
}
async function tdCleanupExecute(cutoff){
  if(role!=='owner') return notify('仅管理员可操作',true);
  if($('tdCleanupDate')?.value!==cutoff) return notify('日期已改变，请重新预览',true);
  if(!confirm('确认预览内容？只归档，不删除财务和取件历史。')) return;
  const typed=prompt('请输入“确认归档”完成二次确认：');
  if(typed!=='确认归档') return notify('未通过二次确认，未执行归档');
  const {data:result,error}=await db.rpc('td_cleanup_archive_v1',{p_cutoff_date:cutoff,p_confirm_text:typed});
  if(error) return notify('归档失败：'+error.message,true);
  notify('归档完成：订单 '+Number(result.orders_archived||0)+' 条，包裹 '+Number(result.parcels_archived||0)+' 条。财务及取件记录保留。');
  await tdCleanupPreview();
}
function tdCleanupPage(){
  if(role!=='owner') return '<h2>无权限</h2>';
  const now=new Date(); const today=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0');
  return '<h2>过期记录清理</h2><p class="muted">仅管理员可操作。手动选择截止日期，先预览再二次确认。此功能仅归档，不物理删除业务记录。</p><div class="panel"><label>截止日期（包含当天）</label><input id="tdCleanupDate" type="date" max="'+today+'" value="'+today+'"><p><button class="primary" onclick="tdCleanupPreview()">预览候选记录</button></p><div id="tdCleanupPreview"><p class="muted">请选择日期并预览。预览不会修改业务数据。</p></div></div>';
}