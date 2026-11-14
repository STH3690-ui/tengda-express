/* V62.2 presentation/interaction only. Existing OCR, intake, matching and permission handlers are reused. */
const tdV622={timers:new Map(),torch:false};
function tdV622Icon(path){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+path+'</svg>'}
const tdV622AlbumIcon=tdV622Icon('<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="8" cy="9" r="1.5"/><path d="m4 17 5-5 4 4 3-3 5 5"/>');
const tdV622TorchIcon=tdV622Icon('<path d="M8 3h8v5l-2 4v8h-4v-8L8 8zM8 7h8M10 13h4"/>');
const tdV622OldBackbar=tdPageBackbar;
tdPageBackbar=function(route){if(route.page!=='scanIntake')return tdV622OldBackbar(route);return '<div class="td-page-backbar td-compact-top"><button type="button" class="td-icon-button" aria-label="返回上一页" onclick="tdBack()">'+tdNavIcon('back')+'</button><h1>扫码入库</h1><button type="button" class="td-icon-button td-home-back" aria-label="返回主页" onclick="tdNavigate(\'home\')">'+tdNavIcon('home')+'</button></div>'};
tdV59PanelHTML=function(){return `<section class="td-live td-photo td-compact" id="tdLivePanel">
<div class="td-live-camera"><video id="tdLiveVideo" autoplay muted playsinline aria-label="高清相机预览"></video><canvas id="tdCaptureFrozen" hidden aria-label="冻结的高清原图区域"></canvas><div id="tdPhotoGuide" class="td-live-guide"></div><span id="tdV622CameraHint">点击快门开启相机</span></div>
<div class="td-compact-camera-actions"><button type="button" id="tdPhotoNative" class="td-icon-button" aria-label="选择相册照片" onclick="tdV622Album()">${tdV622AlbumIcon}</button><button type="button" id="tdPhotoShutter" class="td-shutter" aria-label="开启相机" onclick="tdV622Shutter()"><span></span></button><button type="button" id="tdV622Torch" class="td-icon-button" aria-label="手电筒" aria-pressed="false" onclick="tdV622Torch()" disabled>${tdV622TorchIcon}</button></div>
<input id="tdPhotoInput" type="file" accept="image/*" hidden onchange="tdV61File(this)">
<details id="tdV622CustomerPicker" class="td-customer-picker"><summary><span id="tdV622CustomerLabel">选择已有客户</span><span aria-hidden="true">⌄</span></summary><div class="td-customer-popover"><input id="tdV62CustomerTerm" aria-label="搜索客户姓名或电话" maxlength="80" placeholder="输入姓名或电话号码" autocomplete="off" oninput="tdV622Search('main')"><div id="tdV62Customers" aria-live="polite"></div></div></details>
<div class="td-compact-pair"><label>客户姓名<input id="tdLiveName" maxlength="60" autocomplete="off" placeholder="姓名" oninput="tdV59Edited();tdV622CustomerLabel()"></label><label>电话号码<input id="tdLivePhone" maxlength="25" inputmode="tel" autocomplete="off" placeholder="手机号" oninput="tdV59Edited();tdV622CustomerLabel()"></label></div>
<div class="td-compact-pair"><label>件数<input id="tdV62Pieces" type="number" min="1" max="999999" step="1" value="1" oninput="tdV62MetaEdited()"></label><label>包裹重量 kg<input id="tdV62Weight" type="number" min="0" max="999999" step="0.001" inputmode="decimal" placeholder="选填" oninput="tdV62MetaEdited()"></label></div>
<input id="tdV62Notes" aria-label="备注" placeholder="备注（选填）" maxlength="2000" oninput="tdV62MetaEdited()">
<button type="button" id="tdLiveManual" class="td-compact-confirm" onclick="tdV622Confirm()">确认入库</button>
<p id="tdLiveStatus" role="status" aria-live="polite"></p><button type="button" class="secondary" id="tdLiveResolve" hidden onclick="tdV59Resolve()">核实上次入库结果</button>
<details id="tdV622Advanced"><summary>高级设置</summary><div class="td-compact-advanced"><button type="button" id="tdLiveStart" class="secondary" onclick="tdV59Start()">开启相机</button><button type="button" class="secondary" onclick="tdV59Stop()">停止相机</button><button type="button" class="secondary" onclick="tdV622SystemCamera()">系统高清相机</button><small id="tdPhotoSource">原始高清 · 本机识别</small><pre id="tdCaptureText"></pre><ol id="tdLiveRecent" class="td-live-recent" aria-live="polite"></ol></div></details></section>`};
const tdV622OldPage=tdScanPage;
tdScanPage=function(){return tdV622OldPage().replace('ontoggle="if(this.open)tdV59Stop()"','ontoggle="tdV622LegacyToggle(this)"').replace('传统条码、拍照识别与手动批量入库','旧版识别与批量扫码')};
function tdV622LegacyToggle(details){if(details.open)tdV59Stop();if(!CSS.supports('selector(:has(*))')&&$('tdLivePanel'))$('tdLivePanel').hidden=details.open}
function tdV622CustomerLabel(){const el=$('tdV622CustomerLabel');if(el)el.textContent=tdV62.selected?.name||'选择已有客户'}
function tdV622Search(kind){const main=kind==='main',input=$(main?'tdV62CustomerTerm':'tdV621CustomerTerm'),results=$(main?'tdV62Customers':'tdV621Customers');if(!input)return;clearTimeout(tdV622.timers.get(kind));if(main)tdV62.search++;else tdV621.search++;results?.replaceChildren();const text=input.value.trim(),epoch=tdLive.epoch,actor=user?.id;if(!text)return;tdV622.timers.set(kind,setTimeout(()=>{if(page==='scanIntake'&&user?.id===actor&&epoch===tdLive.epoch&&input.isConnected&&input.value.trim()===text)(main?tdV62Search():tdV621Search())},260))}
function tdV622Album(){$('tdPhotoInput')?.removeAttribute('capture');tdV61Native()}
function tdV622SystemCamera(){$('tdPhotoInput')?.setAttribute('capture','environment');tdV61Native()}
async function tdV622Shutter(){if(tdPhoto.phase==='preview'&&tdLive.running)return tdV61Shutter();return tdV59Start()}
function tdV622Confirm(){if(tdLive.running)tdV59Stop();return tdV59Commit(true)}
async function tdV622Torch(){const track=tdLive.stream?.getVideoTracks()[0];if(!track?.getCapabilities?.().torch)return;try{await track.applyConstraints({advanced:[{torch:!tdV622.torch}]});tdV622.torch=!tdV622.torch}catch{tdV59Message('此设备无法切换手电筒')}tdV61Controls()}
const tdV622OldControls=tdV61Controls;
tdV61Controls=function(){tdV622OldControls();if(page!=='scanIntake')return;const blocked=tdPhoto.phase==='opening'||tdPhoto.processing||tdLive.busy||!!tdLive.pending;const shutter=$('tdPhotoShutter');if(shutter){shutter.disabled=blocked;shutter.setAttribute('aria-label',tdLive.running?'拍照并识别':tdPhoto.image?'重新拍照':'开启相机')}if($('tdLiveManual'))$('tdLiveManual').disabled=blocked||tdPhoto.phase==='success';const track=tdLive.stream?.getVideoTracks()[0],torch=$('tdV622Torch');if(!track)tdV622.torch=false;if(torch){torch.disabled=blocked||!track?.getCapabilities?.().torch;torch.setAttribute('aria-pressed',String(tdV622.torch))}if($('tdV622CameraHint'))$('tdV622CameraHint').hidden=tdLive.running||!!tdPhoto.image;tdV622CustomerLabel()};
const tdV622OldStart=tdV59Start;
tdV59Start=async function(){if($('tdV622Advanced'))$('tdV622Advanced').open=false;return tdV622OldStart()};
const tdV622OldStop=tdV59Stop;
tdV59Stop=function(reset=false){for(const timer of tdV622.timers.values())clearTimeout(timer);tdV622.timers.clear();tdV622OldStop(reset)};
// Old form remains available in its folded section, with the same automatic search interaction.
const tdV622OldLegacyPanel=tdV58PanelHTML;
tdV58PanelHTML=function(){return tdV622OldLegacyPanel().replace('id="tdV621CustomerTerm"','id="tdV621CustomerTerm" oninput="tdV622Search(\'legacy\')"').replace(/<button[^>]*id="tdV621CustomerSearch"[^>]*>[^<]*<\/button>/,'')};
const tdV622OldRows=tdScanRenderRows;
tdScanRenderRows=function(){tdV622OldRows();if(page!=='scanIntake')return;tdScan.rows.forEach((row,i)=>{const input=$('tdScanCustomerTerm'+i);if(!input)return;input.parentElement.querySelector('button')?.remove();input.oninput=()=>{const key='row:'+i;clearTimeout(tdV622.timers.get(key));row.customerSearchToken=(row.customerSearchToken||0)+1;const term=input.value.trim();$('tdScanCustomers'+i)?.replaceChildren();if(term)tdV622.timers.set(key,setTimeout(()=>{if(page==='scanIntake'&&tdScan.rows[i]===row&&input.isConnected&&input.value.trim()===term)tdScanSearchCustomer(i)},260))}});tdV61Controls()};
function tdV622CustomerPicked(){if($('tdV622CustomerPicker'))$('tdV622CustomerPicker').open=false;tdV622CustomerLabel()}
