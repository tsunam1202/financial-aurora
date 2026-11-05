'use strict';
/* Browser-local demonstration workspace. No network credentials or real payments. */
const AuroraSuite = (() => {
 const KEY='financial-aurora-workspace-v1', VERSION=1;
 const uid=p=>p+'-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,6);
 const round=n=>Math.round((n+Number.EPSILON)*100)/100;
 const sum=(a,f)=>round(a.reduce((n,r)=>n+Number(f(r)||0),0));
 const due=(a)=>round(a.amount-a.paid);
 const today='2026-10-31';
 const catalog=window.AuroraCatalog,commerce=window.AuroraCommerce,trade=window.AuroraTrade;
 let tradeUI;
 const legacySystemNames=systems.map(s=>s.name);
 const initialBOM=systems.flatMap((s,i)=>s.items.map(([name,amount],j)=>({id:'BOM-'+i+'-'+j,name,system:s.name,qty:1,price:amount,source:'期初归集'})));
 let replacingLink=false;
 let linkStatus='连接中',linkSnapshot=null,skuQuery='',skuCategory='all',skuScope='catalog',skuLimit=12;
 const seed=()=>({version:VERSION,transactions:structuredClone(baseTransactions),expenses:structuredClone(baseExpenses),activities:[],
  suppliers:[{id:'PO-1020-01',name:'精密加工供应商',item:'悬架精密加工',amount:8600,paid:0,date:'2026-10-30',received:true},{id:'PO-1023-02',name:'碳纤维供应商',item:'车身复材批次',amount:12000,paid:0,date:'2026-11-03',received:false},{id:'PO-1025-03',name:'电子元件供应商',item:'传感器与接插件',amount:8000,paid:0,date:'2026-11-05',received:false}],
  sponsors:[{id:'SP-001',name:'年度品牌合作',kind:'现金',amount:80000,paid:80000,date:'2026-10-12'},{id:'SP-002',name:'汽车文化节活动服务',kind:'现金',amount:16000,paid:16000,date:'2026-10-24'},{id:'SP-003',name:'赛季合作赞助',kind:'现金',amount:36000,paid:0,date:'2026-11-10'},{id:'SP-004',name:'技术合作伙伴 · 材料支持',kind:'实物',amount:24000,paid:0,date:'2026-10-20'}],
  bom:structuredClone(initialBOM),
  budgets:[{id:'赛车研发',amount:240000,committed:29600},{id:'赛事与测试',amount:60000,committed:8000},{id:'工作室运营',amount:20000,committed:0}],
  payroll:[{id:'WG-001',name:'研发工程师 A',role:'研发',base:6500,bonus:500,deduction:0,paid:0},{id:'WG-002',name:'测试工程师 B',role:'研发',base:5000,bonus:500,deduction:0,paid:0},{id:'WG-003',name:'工作室运营 C',role:'运营',base:4500,bonus:0,deduction:300,paid:0}],
  skus:[{id:'SKU-001',name:'Aurora 车队文化衫',price:129,cost:65,stock:80},{id:'SKU-002',name:'AR-26 赛车模型',price:299,cost:150,stock:25},{id:'SKU-003',name:'极光纪念徽章',price:39,cost:12,stock:120}],sales:[],
  tasks:[{id:'TK-001',name:'文化节物料 · 补发票',done:false},{id:'TK-002',name:'出车测试运输 · 补收据',done:false},{id:'TK-003',name:'通用紧固件 · 成本归类',done:false}],
  settings:{name:'极光工作室',owner:'财务管理员',currency:'CNY'},audit:[]});
 let lastSavedRaw=null;
 let db, storageOK=true, current='财务总览', query='', filter='all', lastRows=[];
 function validate(data){
  if(!data||data.version!==VERSION)throw Error('备份版本不匹配');
  for(const key of ['transactions','expenses','suppliers','sponsors','bom','budgets','payroll','skus','sales','tasks','audit','activities']){
   if(!Array.isArray(data[key])||data[key].length>10000)throw Error('数据集合无效：'+key);
   const ids=new Set();for(const row of data[key]){if(!row||typeof row!=='object')throw Error('记录无效');if(row.id){if(ids.has(row.id))throw Error('单号重复');ids.add(row.id)}for(const [k,v] of Object.entries(row)){if(typeof v==='string'&&v.length>2000)throw Error('字段过长');if(typeof v==='number'&&(!Number.isFinite(v)||v<0||v>1e10))throw Error('金额或数量无效')}}
  }
  const str=(r,keys)=>keys.every(k=>typeof r[k]==='string');
  if(!data.settings||!str(data.settings,['name','owner','currency']))throw Error('设置无效');
  for(const r of data.transactions)if(!str(r,['label'])||!['in','out'].includes(r.type)||!Number.isInteger(r.day)||r.day<1||r.day>31||!(r.amount>0))throw Error('流水无效');
  for(const r of data.expenses)if(!str(r,['id','purpose','person','project','system','approval'])||!['pending','review','paid','rejected'].includes(r.state)||!(r.amount>0))throw Error('报销无效');
  for(const key of ['suppliers','sponsors'])for(const r of data[key])if(!str(r,['id','name','date'])||!(r.amount>0||(key==='suppliers'&&r.sku&&!r.openingPayable&&r.amount===0))||!(r.paid>=0&&r.paid<=r.amount))throw Error('应收应付无效');
  for(const r of data.bom)if(!str(r,['id','name','system','source'])||!legacySystemNames.includes(r.system)||!(r.qty>0&&r.price>0))throw Error('BOM无效');
  for(const r of data.payroll)if(!str(r,['id','name','role'])||!['研发','运营'].includes(r.role)||![r.base,r.bonus,r.deduction,r.paid].every(Number.isFinite)||r.base+r.bonus<r.deduction||r.paid>round(r.base+r.bonus-r.deduction))throw Error('工资无效');
  for(const r of data.suppliers)if(typeof r.received!=='boolean'||typeof r.item!=='string')throw Error('采购状态无效');
  for(const r of data.sponsors)if(!['现金','实物'].includes(r.kind))throw Error('赞助类型无效');
  for(const key of ['suppliers','sponsors'])for(const r of data[key])if(!Number.isFinite(r.amount)||!Number.isFinite(r.paid))throw Error('金额须为数字');
  for(const r of data.skus)if(!str(r,['id','name'])||!Number.isInteger(r.stock)||r.stock<0||!(r.price>0&&r.cost>=0))throw Error('SKU无效');
  for(const r of data.sales)if(!str(r,['id','name','sku','status'])||!data.skus.some(s=>s.id===r.sku)||!['待收款','已收款','已取消'].includes(r.status)||!Number.isInteger(r.qty)||r.qty<1||!(r.amount>0&&r.cost>=0))throw Error('销售无效');
  if(data.budgets.length!==3||new Set(data.budgets.map(r=>r.id)).size!==3||!['赛车研发','赛事与测试','工作室运营'].every(id=>data.budgets.some(r=>r.id===id&&r.amount>0&&r.committed>=0)))throw Error('预算无效');
  for(const r of data.tasks)if(!str(r,['id','name'])||typeof r.done!=='boolean')throw Error('待办无效');
  for(const r of data.audit)if(!str(r,['time','action','user']))throw Error('日志无效');
  if(data.requests!==undefined){
   if(!Array.isArray(data.requests)||data.requests.length>1000)throw Error('商城需求无效');
   const ids=new Set();for(const r of data.requests){if(!str(r,['id','customer','status'])||ids.has(r.id)||!['待报价','已转销售单','已关闭'].includes(r.status)||!Array.isArray(r.lines)||!r.lines.length||r.lines.length>60)throw Error('商城需求无效');ids.add(r.id);const skus=new Set();for(const l of r.lines){if(!catalog.get(l.sku)||skus.has(l.sku)||!Number.isInteger(l.qty)||l.qty<1||l.qty>20||!Number.isFinite(l.referencePrice)||l.referencePrice<=0)throw Error('需求明细无效');skus.add(l.sku)}}
  }
  if(data.bomWorkspace!=null&&data.bomWorkspace.datasetVersion===window.AuroraBOM.source.meta.version)window.AuroraBOM.validateState(data.bomWorkspace);
  trade.migrate(data);
  if(trade.validate)trade.validate(data);
  return data;
 }
 try{const raw=localStorage.getItem(KEY);lastSavedRaw=raw;db=raw?validate(JSON.parse(raw)):seed()}catch(error){db=seed();storageOK=false;setTimeout(()=>toast('本地数据无法读取，已载入初始工作区；可在设置恢复备份'),500)}



 function tradeWorkCount(){return db.suppliers.filter(p=>!p.openingPayable&&p.qty>p.receivedQty).length+db.sales.filter(s=>s.status!=='已取消'&&s.qty>s.shippedQty).length+db.sales.filter(s=>s.status!=='已取消'&&s.shippedAmount>s.collected).length}
 function tradeTaskRows(){return [...db.suppliers.filter(p=>!p.openingPayable&&p.qty>p.receivedQty).map(p=>[esc(p.item)+'<small>'+esc(p.id)+'</small>','待收货',String(p.qty-p.receivedQty)+' 件',button('收货入库','go','采购与供应商')]),...db.sales.filter(s=>s.status!=='已取消'&&s.qty>s.shippedQty).map(s=>[esc(s.name)+'<small>'+esc(s.id)+'</small>','待出库',String(s.qty-s.shippedQty)+' 件',button('出库交付','go','SKU 与销售')]),...db.sales.filter(s=>s.status!=='已取消'&&s.shippedAmount>s.collected).map(s=>[esc(s.name)+'<small>'+esc(s.id)+'</small>','待回款',money(s.shippedAmount-s.collected),button('登记回款','go','SKU 与销售')])]}

 function tradeMoney(value){return typeof value==='number'&&Number.isFinite(value)?money(value):'待成本确认'}
 function renderTradeHome(){const stats=trade.summary(db);$('#tradeHome').innerHTML='<div class="trade-home-heading"><span>业务财务联动</span><button class="text-button" data-module="业务联动">查看单据与流水 →</button></div><div class="trade-home-metrics">'+[['待收货金额',stats.commitment,'采购与供应商'],['收货应付',stats.ap,'采购与供应商'],['库存账面价值',stats.inventoryValue,'库存台账'],['已交付销售应收',stats.ar,'SKU 与销售'],['已交付毛利',stats.grossProfit,'业务联动']].map(([name,value,target])=>`<button data-module="${target}"><small>${name}</small><strong>${tradeMoney(value)}</strong></button>`).join('')+'</div>'}

 function restoreBomWorkspace(){
  const saved=db.bomWorkspace;
  if(saved&&saved.datasetVersion!==window.AuroraBOM.source.meta.version){db.bomWorkspacePrevious=saved;window.AuroraBOM.reset(true);return}
  window.AuroraBOM.replaceState(saved??null,true);
 }

 // One authorized sample batch. Both the migration marker and the engine's
 // operation IDs travel with backups; paid rows are never reopened on reload.
 function addPartsPurchaseSamples(){
  const key='partsPurchases20261105';
  if(db.workspaceMigrations?.[key]?.version===1)return;
  const draft=structuredClone(db), ids=[];
  const samples=[
   {sku:'toyo-r888r',name:'轮胎配件供应商',qty:4,unitCost:1280,date:'2026-11-03'},
   {sku:'ebc-yellowstuff-fast-street-pads',name:'制动配件供应商',qty:2,unitCost:980,date:'2026-11-05'},
   {sku:'aim-solo-2-gps-track-day-racing-lap-timer-and-data-logger',name:'数据采集设备供应商',qty:1,unitCost:2680,date:'2026-11-08'}
  ];
  for(const sample of samples){
   const operation='sample.parts-purchases.v1:'+sample.sku;
   const purchase=trade.createPurchase(draft,{...sample,operationId:operation+':create'});
   trade.receivePurchase(draft,purchase.id,sample.qty,operation+':receive');
   const stored=draft.suppliers.find(row=>row.id===purchase.id);
   Object.assign(stored,{source:'sample',sampleBatch:key,sampleKey:sample.sku,costBasis:'样例采购单价，非供应商正式报价'});
   const receipt=draft.stockMovements.find(row=>row.operationId===operation+':receive');
   if(receipt)Object.assign(receipt,{source:'sample',sampleBatch:key});
   ids.push(purchase.id);
  }
  draft.workspaceMigrations={...draft.workspaceMigrations,[key]:{version:1,source:'sample',purchaseIds:ids}};
  trade.validate(draft);
  db=draft;
 }
 function sync(){reconcileCatalog();trade.migrate(db);addPartsPurchaseSamples();window.AuroraOpeningCash=db.tradeOpeningCash;transactions=structuredClone(db.transactions);expenses=structuredClone(db.expenses);activities=db.activities.map(a=>[a.time,a.action]);const source=window.AuroraBOM;systems.splice(0,systems.length,...source.systems().map(s=>({name:s.name,id:s.id,color:s.color,value:s.total,items:source.source.parts.filter(p=>p.systemId===s.id).map(p=>[p.name,p.total])})));}
 function persist(){db.bomWorkspace=window.AuroraBOM.exportState();db.transactions=structuredClone(transactions);db.expenses=structuredClone(expenses);try{lastSavedRaw=JSON.stringify(db);localStorage.setItem(KEY,lastSavedRaw);storageOK=true}catch(e){storageOK=false;toast('浏览器无法保存，请立即导出备份')} }
 function commit(action,replaceLink=false){db.audit.unshift({time:new Date().toLocaleString('zh-CN'),action,user:db.settings.owner});db.activities.unshift({time:new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'}),action});db.audit=db.audit.slice(0,500);db.activities=db.activities.slice(0,30);sync();refreshHome();persist();publishCommerce(replaceLink);if(current!=='财务总览')renderPage();}
 function flow(type,amount,label,ref){db.transactions.push({day:31,type,amount:round(amount),label,ref:ref||uid('TX')})}
 const payrollNet=r=>round(r.base+r.bonus-r.deduction), bomTotal=()=>round(window.AuroraBOM.total());
 const supplierDue=()=>sum(db.suppliers,p=>Math.max(0,(p.receivedAmount??p.amount)-p.paid)), sponsorDue=()=>sum(db.sponsors.filter(s=>s.kind==='现金'),due);
 const payrollDue=()=>sum(db.payroll,r=>payrollNet(r)-r.paid);
 function spend(id){if(id==='赛车研发')return bomTotal()+sum(db.payroll.filter(p=>p.role==='研发'),payrollNet);if(id==='赛事与测试')return 24000;return 12000+sum(db.payroll.filter(p=>p.role==='运营'),payrollNet)}
 const oldRender=render,oldRenderStats=renderStats,oldAddActivity=addActivity;
 renderStats=function(){oldRenderStats();const cards=$('#stats').children;cards[3].querySelector('.stat-value').innerHTML=money(sponsorDue());cards[3].querySelector('small').textContent=db.sponsors.filter(s=>s.kind==='现金'&&due(s)>0).length+' 笔回款待跟进';cards[5].querySelector('.stat-value').innerHTML=money(supplierDue());cards[5].querySelector('small').textContent=db.suppliers.filter(s=>(s.receivedAmount??s.amount)-s.paid>0).length+' 笔待付'};
 renderTasks=function(){const pay=db.expenses.filter(e=>e.state==='pending').length+db.suppliers.filter(s=>(s.receivedAmount??s.amount)-s.paid>0).length+db.payroll.filter(p=>payrollNet(p)>p.paid).length, review=db.expenses.filter(e=>e.state==='review').length,other=db.tasks.filter(t=>!t.done).length+tradeWorkCount();$('#taskCount').textContent=$('#navTaskCount').textContent=pay+review+other;$('#taskList').innerHTML=[['待付款',pay,'wallet'],['待审批',review,'receipt'],['订单 / 其他',other,'layers']].map(([n,c,i])=>`<button class="task-row" data-module="待办中心"><span class="task-icon">${icon(i)}</span>${n}<strong>${c}</strong>${icon('chevron')}</button>`).join('');const late=db.suppliers.filter(s=>(s.receivedAmount??s.amount)-s.paid>0&&s.date<'2026-11-01').length;$('.warning').innerHTML=icon('alert')+(late?late+' 笔供应商付款已逾期':'付款计划已更新')+icon('chevron')};
 renderSuppliers=function(){$('#supplierList').innerHTML=db.suppliers.filter(s=>(s.receivedAmount??s.amount)-s.paid>0).slice(0,6).map(s=>`<div class="supplier-row"><div class="date-block ${s.date<'2026-11-01'?'overdue':''}"><small>${esc(s.date.slice(5,7))}月</small>${esc(s.date.slice(-2))}</div><div class="supplier-name">${esc(s.item||s.name)}<small>${esc(s.name)} · ${esc(s.id)}</small></div><div class="supplier-amount">${money(Math.max(0,(s.receivedAmount??s.amount)-s.paid))}<button class="text-button" data-module="采购与供应商">登记结款 →</button></div></div>`).join('')||'<p class="empty">暂无待付供应商</p>';$('.supplier-total strong').textContent=money(supplierDue())};
 function refreshHome(){oldRender();$('.cash-footer strong').textContent=money(db.tradeOpeningCash);renderSuppliers();renderTradeHome();const total=bomTotal()||1;let used=0;const perimeter=2*Math.PI*88;$('#bomChart').innerHTML='<circle cx="120" cy="120" r="88" fill="none" stroke="#f3edf7" stroke-width="26"/>'+systems.map((s,i)=>{const len=s.value/total*perimeter;const html=`<circle data-suite-bom="${i}" tabindex="0" role="button" aria-label="${esc(s.name)}成本明细" cx="120" cy="120" r="88" fill="none" stroke="${s.color}" stroke-width="26" stroke-dasharray="${Math.max(0,len-4)} ${perimeter-Math.max(0,len-4)}" stroke-dashoffset="${-used}"/>`;used+=len;return html}).join('');$('#donutValue').textContent=money(bomTotal());$('#donutLabel').textContent=window.AuroraBOM.exportState().planActive?'方案测算成本':'源表已计价合计';$('#donutHint').textContent='E27 · 8 系统 · 400 记录';$('.bom-footer').innerHTML='<span>源表1条成本未填</span><span>总额与构成差20.09元待核</span>';$('#bomLegend').innerHTML=systems.map((s,i)=>`<button data-suite-bom="${i}"><span><b class="legend-dot" style="background:${s.color}"></b>${s.name}</span><strong>${money(s.value)}</strong><small>${(s.value/total*100).toFixed(1)}% · ${s.items.length} 类归集项目</small></button>`).join('');
 const totalBudget=sum(db.budgets,b=>b.amount), spent=sum(db.budgets,b=>spend(b.id)),committed=sum(db.budgets,b=>b.committed);$('.budget-total strong').textContent=money(totalBudget);$('.budget-total .soft-badge').textContent='成本占用 '+Math.round(spent/totalBudget*100)+'%';$('.budget-stack').innerHTML=[spent,committed,Math.max(0,totalBudget-spent-committed)].map(n=>`<span style="width:${n/Math.max(totalBudget,spent+committed)*100}%"></span>`).join('');$('.budget-stack').setAttribute('aria-label',`预算${totalBudget}，已发生${spent}，未履约${committed}`);$('.budget-legend').querySelectorAll('strong').forEach((el,i)=>el.textContent=money([spent,committed,totalBudget-spent-committed][i]));$('.budget-rows').innerHTML='<div class="mini-table-head"><span>项目</span><span>已发生 / 预算</span><span>执行率</span></div>'+db.budgets.map(b=>`<div class="budget-row"><span>${esc(b.id)}</span><span>${spend(b.id).toLocaleString()} / ${b.amount.toLocaleString()}</span><b>${Math.round(spend(b.id)/b.amount*100)}%<em style="--p:${Math.min(100,spend(b.id)/b.amount*100)}%"></em></b></div>`).join('');
 const sponsorPanel=$('.sponsor-panel');sponsorPanel.querySelectorAll('.sponsor-row').forEach(n=>n.remove());sponsorPanel.querySelector('.sponsor-note').insertAdjacentHTML('beforebegin',db.sponsors.filter(s=>s.kind==='现金').slice(0,3).map(s=>`<div class="sponsor-row"><span class="sponsor-icon">${icon('handshake')}</span><span>${esc(s.name)}<small>${esc(s.date)}</small></span><strong>${money(s.amount)}<small>${due(s)?'待收 '+money(Math.max(0,(s.receivedAmount??s.amount)-s.paid)):'已到账'}</small></strong></div>`).join(''));
 document.dispatchEvent(new CustomEvent('aurora:finance-updated'));
 }
 render=function(){db.transactions=structuredClone(transactions);db.expenses=structuredClone(expenses);refreshHome();persist()};
 addActivity=function(action){oldAddActivity(action);db.audit.unshift({time:new Date().toLocaleString('zh-CN'),action,user:db.settings.owner});db.activities=activities.map(([time,action])=>({time,action}));};
 const navGroups=[['工作台',[['财务总览','home'],['待办中心','checklist']]],['资金与业务',[['业务联动','layers'],['收支流水','wallet'],['报销与付款','receipt'],['采购与供应商','package'],['库存台账','package'],['赞助与应收','handshake'],['SKU 与销售','flag']]],['成本与分析',[['整车成本 / BOM','layers'],['项目预算','target'],['工资与薪酬','building'],['研发成本','target'],['报表中心','activity']]]];
 $('#navigation').innerHTML=navGroups.map(([g,items])=>`<div class="nav-label">${g}</div>`+items.map(([name,i])=>`<button class="nav-item" data-route="${name}">${icon(i)}${name}${name==='待办中心'?'<span class="nav-count" id="navTaskCount"></span>':''}</button>`).join('')).join('');
 const page=document.createElement('main');page.id='suitePage';page.className='suite-page';page.hidden=true;$('.shell').append(page);
 const captions={'业务联动':'采购收货、库存与成本、销售交付及资金结算共享同一组业务单据。','库存台账':'物理库存、订单预占、可售数量与账面成本分别跟踪。','待办中心':'先处理待审批和到期事项，让每一笔款项都有去向。','收支流水':'2026年10月账期 · 记录现金变动，并追溯业务来源。','报销与付款':'提交、审批、票据和付款分别跟踪。','采购与供应商':'采购单、到货与分次结款集中管理。','赞助与应收':'现金回款与实物支持分开管理。','SKU 与销售':'商品库存、销售订单与收款形成闭环。','整车成本 / BOM':'E27 深圳技术大学 FSEC 成本报告 · 源表、工艺追溯与方案测算。','项目预算':'预算 = 已发生 + 未履约采购 + 可用额度。','工资与薪酬':'2026年10月工资台账 · 记录应发、扣减、实发与付款。','研发成本':'把零件、研发人员投入与测试成本放在一起看。','报表中心':'当前业务台账与历史已结账报表分别查看。','飞书 OA':'本地导入审批导出数据；在线连接需后端应用授权。','管理设置':'工作室资料、本地备份与操作记录。'};
 function route(name,tradeTab){if(tradeUI&&name!==current)tradeUI.resetSearch();if(name==='业务联动'&&tradeUI)tradeUI.setTab(tradeTab||'overview');if(!captions[name]&&name!=='财务总览')return;if($('#dialog').open)$('#dialog').close();current=name;query='';filter='all';$('#home').hidden=name!=='财务总览';page.hidden=name==='财务总览';$('.breadcrumb strong').textContent=name==='财务总览'?'财务工作台':name;document.querySelectorAll('[data-route]').forEach(b=>b.classList.toggle('active',b.dataset.route===name));$('#sidebar').classList.remove('open');$('#navOverlay').classList.remove('open');if(name!=='财务总览')renderPage();history.replaceState(null,'','#'+encodeURIComponent(name));window.scrollTo(0,0);document.dispatchEvent(new CustomEvent('aurora:route',{detail:name}));}
 showModule=route;showTasks=()=>route('待办中心');
 const button=(name,action,id='',style='text-button')=>`<button class="${style}" data-op="${action}" data-id="${esc(id)}">${name}</button>`;
 const tag=(name,color='')=>`<span class="suite-tag ${color}">${esc(name)}</span>`;
 const metrics=items=>`<div class="suite-metrics">${items.map(([label,value,note=''])=>`<div class="suite-metric"><span>${label}</span><strong>${value}</strong><small>${note}</small></div>`).join('')}</div>`;
 const note=s=>`<div class="suite-note">${s}</div>`;
 function table(headers,rows){const shown=rows.filter(row=>(filter==='all'||row.some(v=>String(v).includes(filter)))&&row.join(' ').toLowerCase().includes(query.toLowerCase()));lastRows=[headers,...shown.map(r=>r.map(v=>{const el=document.createElement('div');el.innerHTML=String(v);el.querySelectorAll('button').forEach(b=>b.remove());return el.textContent.trim()}))];return `<div class="suite-tools"><input id="suiteSearch" aria-label="搜索当前列表" placeholder="搜索名称、单号或项目…" value="${esc(query)}"><select id="suiteFilter" aria-label="筛选状态"><option value="all">全部状态</option>${['待付款','审批中','已付款','已驳回','待收款','已收款','已取消','待到货','已到货'].map(s=>`<option ${filter===s?'selected':''}>${s}</option>`).join('')}</select><small>${shown.length} 条记录 · 金额单位：元</small>${button('导出 CSV','export')}</div><div class="suite-table-scroll"><table class="suite-table"><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${shown.length?shown.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join('')}</tr>`).join(''):`<tr><td class="suite-empty" colspan="${headers.length}">暂无符合条件的记录</td></tr>`}</tbody></table></div>`}
 function bars(rows){const max=Math.max(...rows.map(r=>r[1]),1);return '<div class="suite-bars">'+rows.map(([label,n,limit])=>`<div><div class="suite-bar-label"><span>${esc(label)}</span><strong>${money(n)}${limit?' / '+money(limit):''}</strong></div><div class="suite-bar-track"><span style="width:${Math.min(100,n/(limit||max)*100)}%"></span></div></div>`).join('')+'</div>'}


 function ensureFresh(notify=true){
  try{const raw=localStorage.getItem(KEY);if(raw===lastSavedRaw)return true;if(!raw)return true;const latest=validate(JSON.parse(raw));db=latest;lastSavedRaw=raw;restoreBomWorkspace();sync();refreshHome();if($('#dialog').open)$('#dialog').close();if(current!=='财务总览')renderPage();if(notify)toast('另一个财务页面已更新数据，请基于最新记录重新操作');return false}catch(error){if(notify)toast('无法读取最新数据，请先备份并刷新');return false}
 }
 window.addEventListener('storage',event=>{if(event.key===KEY)ensureFresh(false)});

 function reconcileCatalog(){
  db.requests ||= [];
  for(const product of catalog.products){
   let sku=db.skus.find(s=>s.id===product.id);
   if(!sku){sku={id:product.id,name:product.brand+' '+product.name,price:product.price,cost:0,stock:0,priceConfirmed:false,costConfirmed:false};db.skus.push(sku)}
   Object.assign(sku,{name:product.brand+' '+product.name,brand:product.brand,category:product.category,unit:product.unit||'套',image:product.image,model:product.model,source:'catalog',referencePrice:product.price,concept:!!product.concept});
  }
 }
 function mergeRequests(data){
  if(replacingLink)return;
  ensureFresh(false);
  if(!data||!Array.isArray(data.requests))return;
  linkSnapshot=data;const previousStatus=linkStatus;linkStatus='已连接';let changed=false;
  for(const request of data.requests){const local=db.requests.find(r=>r.id===request.id);if(!local){db.requests.unshift(structuredClone(request));changed=true}else if(local.status==='待报价'&&request.status!=='待报价'){Object.assign(local,structuredClone(request));changed=true}}
  if(changed)persist();
  if((changed||previousStatus!==linkStatus)&&current==='SKU 与销售'&&!$('#dialog').open)renderPage();
 }
 async function publishCommerce(replaceLink=false){
  if(replaceLink)replacingLink=true;
  try{
   await commerce.publish({...(replaceLink?{replaceRequests:db.requests}:{}),inventory:db.skus.filter(s=>s.source==='catalog').map(s=>({id:s.id,stock:trade.available(db,s.id),physicalStock:s.stock,reservedStock:s.stock-trade.available(db,s.id),price:s.price,priceConfirmed:!!s.priceConfirmed})),updates:db.requests.map(r=>({id:r.id,status:r.status,sales:db.sales.filter(s=>s.requestId===r.id).map(s=>({id:s.id,sku:s.sku,qty:s.qty,amount:s.amount,status:s.status,shippedQty:s.shippedQty,collected:s.collected,fulfillmentStatus:s.fulfillmentStatus}))}))});linkStatus='已连接';
  }catch(error){linkStatus=error.message;if(current==='SKU 与销售'&&!$('#dialog').open)renderPage()}finally{if(replaceLink)replacingLink=false}
 }
 function renderCommerce(){
  const linked=db.skus.filter(s=>s.source==='catalog');
  const items=db.skus.filter(s=>(skuScope==='catalog'?s.source==='catalog':s.source!=='catalog')&&(skuCategory==='all'||s.category===skuCategory)&&[s.id,s.name,s.brand,s.model].join(' ').toLowerCase().includes(skuQuery.toLowerCase()));
  const shop=commerce.shopURL;
  const pending=db.requests.filter(r=>r.status==='待报价');
  const inventory=items.slice(0,skuLimit).map(s=>{const productURL=new URL(shop);productURL.searchParams.set('product',s.id);return `<tr><td><div class="sku-product">${s.image?`<img src="${esc(window.AuroraAssetURL(s.image))}" alt="${esc(s.name)}" loading="lazy">`:''}<span>${esc(s.name)}<small>${esc(s.id)} · ${esc(s.model||'本地商品')}</small>${s.concept?tag('定制概念'):''}</span></div></td><td>${esc(catalog.categoryLabel(s.category)||'本地商品')}<small>${esc(s.unit||'件')}</small></td><td>${s.referencePrice?money(s.referencePrice):'—'}<small>${s.priceConfirmed===false?'工作室报价待确认':money(s.price)+' · 工作室报价'}</small></td><td>${s.costConfirmed===false?tag('待登记'):money(s.cost)}</td><td><strong>可售 ${trade.available(db,s.id)}</strong><small>在库 ${s.stock} · 预占 ${s.stock-trade.available(db,s.id)}</small><small>账面 ${tradeMoney(s.inventoryValue)}</small></td><td>${button('入库','stock',s.id)}${button('报价 / 成本','skuFinance',s.id)}${s.source==='catalog'?`<a class="suite-link" href="${esc(productURL.href)}" target="_blank" rel="noopener">商城详情 ↗</a>`:''}</td></tr>`}).join('');
  const requests=db.requests.map(r=>`<div class="sku-request"><div class="sku-request-head"><span><strong>${esc(r.customer)}</strong><small>${esc(r.id)} · 商城选购清单</small></span>${tag(r.status,r.status==='待报价'?'amber':'green')}</div><div class="sku-request-items">${r.lines.map(line=>{const sku=db.skus.find(s=>s.id===line.sku);return `<span>${esc(sku?.name||line.sku)} × ${line.qty} <small>目录参考 ${money(line.referencePrice*line.qty)}</small></span>`}).join('')}</div><div class="suite-actions">${r.status==='待报价'?button('确认报价并转销售单','requestConvert',r.id,'button primary')+button('关闭需求','requestClose',r.id,'button'):db.sales.filter(s=>s.requestId===r.id).map(s=>tag(s.status)).join('')}</div></div>`).join('');
  return metrics([['商城目录',linked.length+' 项','与原网站共用商品来源'],['当前在库',sum(linked,s=>s.stock)+' 件','物理库存与可售数量分开'],['待报价需求',pending.length+' 笔','确认后预占可售数量'],['销售待收款',money(sum(db.sales.filter(s=>s.status!=='已取消'),s=>Math.max(0,s.amount-(s.collected||0))))]])+
   `<div class="suite-note sku-link-note"><span><b>${esc(linkStatus)}</b> · 商品名、图片、分类、单位及参考预算来自 Aurora 商城；成本、报价与库存由财务管理。</span><div>${button('同步需求与库存','linkRefresh','','button')} <a class="button" href="${esc(shop)}" target="_blank" rel="noopener">打开原商城 ↗</a></div></div>`+
   `<section class="suite-card"><div class="suite-actions sku-section-head"><h2>商品与库存</h2>${button('导出 SKU','skuExport','','button')}</div><div class="suite-tools"><div class="suite-pill-row">${button('商城目录 '+linked.length,'skuCatalog')}${button('本地商品 '+(db.skus.length-linked.length),'skuLocal')}</div><input id="skuSearch" aria-label="搜索商品 SKU" placeholder="搜索品牌、商品、型号或 SKU" value="${esc(skuQuery)}"><select id="skuCategory" aria-label="商品分类"><option value="all">全部分类</option>${Object.entries(catalog.categoryNames).filter(([id])=>id!=='all').map(([id,name])=>`<option value="${esc(id)}" ${skuCategory===id?'selected':''}>${esc(name)}</option>`).join('')}</select><small>${items.length} 项</small></div><div class="suite-table-scroll"><table class="suite-table"><thead><tr><th>SKU / 商品 / 型号</th><th>分类 / 单位</th><th>目录参考预算 / 报价</th><th>单位成本</th><th>库存</th><th>操作</th></tr></thead><tbody>${inventory||'<tr><td colspan="6" class="suite-empty">暂无符合条件的商品</td></tr>'}</tbody></table></div>${items.length>skuLimit?button('继续显示商品','skuMore','','button'):''}</section>`+
   `<section class="suite-card"><h2>商城报价需求 <span class="count">${pending.length}</span></h2><p class="suite-help">商城清单提交后在这里出现。需确认规格、售价和可用库存；尚未转单的需求不计收入、不扣库存。</p>${requests||'<p class="suite-help">暂无需求。去商城加入配件，再从选购清单提交本地报价需求。</p>'}</section>`+
   tradeUI.renderSales()+
   note('商城60项为选型目录，轮胎尺寸、接口和定制配置需另行确认；不是60个已核验实物库存。原商城公开参考预算保持原值，财务不把目录价当采购成本。采购到货通过收货单入库；销售建单预占，出库结转成本，收款核对应收。库存调整保留独立流水。');
 }
 function showConversion(id){
  const request=db.requests.find(r=>r.id===id);if(!request||request.status!=='待报价')return;
  const fields=request.lines.map((line,index)=>{const sku=db.skus.find(s=>s.id===line.sku);return `<div class="sku-quote-line"><strong>${esc(sku?.name||line.sku)}</strong><p>${line.qty} ${esc(sku?.unit||'件')} · 当前可售 ${sku?trade.available(db,sku.id):0} · 目录参考 ${money(line.referencePrice)}</p>${field('price'+index,'确认销售单价（元）','number',sku?.price||line.referencePrice)}</div>`}).join('');
  modal('确认报价并转销售单',`<form id="commerceConvertForm" class="suite-form" data-id="${esc(id)}">${note('请确认适配规格、最终单价与库存。确认后创建销售单并预占可售数量，出库时扣减物理库存并结转成本，收款只更新资金。')}<p>${esc(request.customer)} · ${esc(id)}</p>${fields}<p id="convertError" class="suite-error" role="alert"></p><div class="dialog-actions"><button class="button" type="button" data-close>取消</button><button class="button primary" type="submit">确认转单并预占库存</button></div></form>`);
 }
 document.addEventListener('submit',event=>{
  if(event.target.id!=='commerceConvertForm')return;event.preventDefault();if(!ensureFresh())return;const id=event.target.dataset.id,request=db.requests.find(r=>r.id===id);
  try{
   if(!request||request.status!=='待报价'||db.sales.some(s=>s.requestId===id))throw Error('需求已处理，请刷新后查看');
   const formData=new FormData(event.target);const lines=request.lines.map((line,index)=>{const sku=db.skus.find(s=>s.id===line.sku),price=round(Number(formData.get('price'+index)));if(!sku||trade.available(db,sku.id)<line.qty)throw Error((sku?.name||line.sku)+' 库存不足，请先入库');if(!Number.isFinite(price)||price<=0||price>10000000)throw Error('请填写有效销售单价');return {sku,qty:line.qty,price}});
   const draft=structuredClone(db);for(const line of lines){trade.createSale(draft,{name:request.customer,sku:line.sku.id,qty:line.qty,unitPrice:line.price,requestId:id})}draft.requests.find(r=>r.id===id).status='已转销售单';db=draft;$('#dialog').close();commit('商城需求转销售单 '+id);toast('已转为销售单，可售库存已预占');
  }catch(error){$('#convertError').textContent=error.message}
 });

 function renderPage(){
  let content='', actions='';
  const add=(label,kind)=>button('+ '+label,'new',kind,'button primary');
  if(current==='收支流水'){const t=totals();actions=add('登记收支','cash');content=metrics([['当前余额',money(t.balance),'期初 '+money(db.tradeOpeningCash)],['累计收款',money(t.income)],['累计付款',money(t.out)],['净现金流',money(t.net)]])+`<section class="suite-card">${table(['日期','方向','用途','金额','关联来源'],db.transactions.slice().sort((a,b)=>b.day-a.day).map(t=>['2026-10-'+String(t.day).padStart(2,'0'),tag(t.type==='in'?'收款':'付款',t.type==='in'?'green':'amber'),esc(t.label),money(t.amount),esc(t.ref||'期初导入')]))}</section>`}
  if(current==='报销与付款'){actions=add('提交报销','expense');content=metrics([['待审批',db.expenses.filter(e=>e.state==='review').length+' 笔'],['待付款',money(totals().pending)],['已付款',money(sum(db.expenses.filter(e=>e.state==='paid'),e=>e.amount))],['待补票据',db.expenses.filter(e=>!e.receipt).length+' 笔']])+`<section class="suite-card">${table(['单据 / 用途','申请人 / 项目','金额','审批与付款','票据','操作'],db.expenses.map(e=>[esc(e.id)+'<small>'+esc(e.purpose)+'</small>',esc(e.person)+'<small>'+esc(e.project+' · '+e.system)+'</small>',money(e.amount),tag(({review:'审批中',pending:'待付款',paid:'已付款',rejected:'已驳回'})[e.state],e.state==='paid'?'green':e.state==='rejected'?'red':'amber'),e.receipt?tag('已登记','green'):tag('待补票据'),(e.state==='review'?button('通过','approve',e.id)+button('驳回','reject',e.id):e.state==='pending'?button('登记付款','expensePay',e.id):'')+button(e.receipt?'查看票据备注':'登记票据','receipt',e.id)]))}</section>`}
  if(current==='采购与供应商'){content=tradeUI.render('purchases');}
  if(current==='库存台账'){content=tradeUI.render('inventory');}
  if(current==='业务联动'){content='<div class="suite-note sku-link-note"><span>用一笔示例直观看到收货、库存、应付、出库成本和收款的同源变化。</span><button class="button" data-tradeop="demo">创建联动示例</button></div>'+tradeUI.render();}
  if(current==='赞助与应收'){actions=add('登记合作','sponsor');content=metrics([['现金合作总额',money(sum(db.sponsors.filter(s=>s.kind==='现金'),s=>s.amount))],['已收现金',money(sum(db.sponsors.filter(s=>s.kind==='现金'),s=>s.paid))],['待回款',money(sponsorDue())],['实物支持参考值',money(sum(db.sponsors.filter(s=>s.kind==='实物'),s=>s.amount))]])+`<section class="suite-card">${table(['合作编号 / 名称','支持类型','合同金额 / 参考值','已回款','剩余应收','计划日期','操作'],db.sponsors.map(s=>[esc(s.id)+'<small>'+esc(s.name)+'</small>',tag(s.kind),money(s.amount),s.kind==='现金'?money(s.paid):'不计现金',s.kind==='现金'?money(Math.max(0,(s.receivedAmount??s.amount)-s.paid)):'—',esc(s.date),s.kind==='现金'&&due(s)>0?button('登记回款','sponsorPay',s.id):tag(s.kind==='实物'?'实物登记':'已收款','green')]))}</section>`}
  if(current==='工资与薪酬'){actions=add('新增工资条','payroll');content=metrics([['应发工资',money(sum(db.payroll,p=>p.base+p.bonus))],['扣减合计',money(sum(db.payroll,p=>p.deduction))],['应实发金额',money(sum(db.payroll,payrollNet))],['待发金额',money(payrollDue())]])+note('应发 = 基本工资 + 奖金；应实发 = 应发 − 扣减。新增工资条即计入对应人员成本，付款只影响现金和待发金额。不自动计算个税、社保或发起代发。')+`<section class="suite-card">${table(['员工 / 岗位','基本工资','奖金','扣减','应实发','已付 / 待发','操作'],db.payroll.map(p=>[esc(p.name)+'<small>'+esc(p.role)+'</small>',money(p.base),money(p.bonus),money(p.deduction),money(payrollNet(p)),money(p.paid)+'<small>待发 '+money(payrollNet(p)-p.paid)+'</small>',payrollNet(p)>p.paid?button('登记发放','wagePay',p.id):tag('已付款','green')]))}</section>`}
  if(current==='整车成本 / BOM'){actions='';content='<div class="suite-actions" style="margin-bottom:16px"><button class="button" data-bomref="standards">标准费率库 · 1510条</button><button class="button" data-bomref="fca">FCA工艺成本卡 · 394张</button></div>'+window.AuroraBOM.render();}
  if(current==='项目预算'){actions=button('调整预算','new','budget','button primary');const total=sum(db.budgets,b=>b.amount),spent=sum(db.budgets,b=>spend(b.id)),c=sum(db.budgets,b=>b.committed);content=metrics([['总预算',money(total)],['已发生成本',money(spent)],['未履约采购',money(c)],['可用额度',money(total-spent-c)]])+`<section class="suite-card">${bars(db.budgets.map(b=>[b.id,spend(b.id)+b.committed,b.amount]))}</section><section class="suite-card">${table(['项目','预算','已发生','未履约采购','可用额度','预警'],db.budgets.map(b=>{const free=round(b.amount-spend(b.id)-b.committed);return [esc(b.id),money(b.amount),money(spend(b.id)),money(b.committed),money(free),tag(free<0?'超预算':free/b.amount<.15?'额度偏紧':'正常',free<0?'red':free/b.amount<.15?'amber':'green')]}))}</section>`+note('BOM采用E27赛事标准成本（含1条未填金额）；本页按工作区台账进行管理测算。赛车研发包含当前BOM口径和研发工资应实发；赛事与测试期初成本 ¥24,000；工作室运营包含期初成本 ¥12,000 和运营工资。未履约采购是单独维护的预算承诺，不与已发生成本相加重复入账。')}
  if(current==='研发成本'){const labor=sum(db.payroll.filter(p=>p.role==='研发'),payrollNet),total=bomTotal()+labor+24000;content=metrics([['研发投入合计',money(total)],['整车零件',money(bomTotal())],['研发人员成本',money(labor)],['测试验证成本',money(24000),'期初归集']])+`<div class="suite-split"><section class="suite-card"><h2>研发投入构成</h2>${bars([['整车零件与加工',bomTotal()],['研发人员工资',labor],['测试与验证',24000]])}</section><section class="suite-card"><h2>成本从哪里来</h2><div class="suite-state"><span>零件、加工与材料</span>${button('查看 BOM →','go','整车成本 / BOM')}</div><div class="suite-state"><span>研发人员应实发工资</span>${button('查看工资 →','go','工资与薪酬')}</div><div class="suite-state"><span>测试运输与场地期初归集</span><strong>¥24,000</strong></div><p class="suite-help">BOM按E27源表标准成本，工资与测试按管理口径归集。整车研发预算对应零件与人员；测试成本归入赛事与测试预算。各项在预算汇总中只计一次。</p></section></div>`}
  if(current==='SKU 与销售'){actions=add('新增本地 SKU','sku')+add('新建销售单','sale');content=renderCommerce();}
  if(current==='待办中心'){actions=add('新增事项','task');const rows=[...tradeTaskRows(),...db.expenses.filter(e=>['pending','review'].includes(e.state)).map(e=>[esc(e.purpose),e.state==='review'?'待审批':'待付款',money(e.amount),button('处理报销','go','报销与付款')]),...db.suppliers.filter(s=>(s.receivedAmount??s.amount)-s.paid>0).map(s=>[esc(s.name),s.date<'2026-11-01'?'逾期待付款':'待付款',money(Math.max(0,(s.receivedAmount??s.amount)-s.paid)),button('处理结款','go','采购与供应商')]),...db.payroll.filter(p=>p.paid<payrollNet(p)).map(p=>[esc(p.name)+'工资','待付款',money(payrollNet(p)-p.paid),button('处理工资','go','工资与薪酬')]),...db.tasks.map(t=>[esc(t.name),t.done?'已完成':'待处理','—',button(t.done?'重新打开':'标记完成','taskToggle',t.id)])];content=metrics([['待审批',db.expenses.filter(e=>e.state==='review').length+' 笔'],['业务待付款',money(totals().pending+supplierDue()+payrollDue())],['其他未完成',db.tasks.filter(t=>!t.done).length+' 项'],['已完成事项',db.tasks.filter(t=>t.done).length+' 项']])+`<section class="suite-card">${table(['事项','状态','金额','操作'],rows)}</section>`}
  if(current==='报表中心'){const t=totals();actions=button('导出当前收支','cashExport','','button')+button('打印本页','print','','button');content=metrics([['当前现金余额',money(t.balance)],['报销与供应商应付',money(t.pending+supplierDue())],['应付工资',money(payrollDue())],['业务应收',money(sponsorDue()+trade.summary(db).ar)]])+note('上方指标和下方现金桥反映当前业务台账。历史三大报表为固定已结账快照，不随未记会计分录的业务操作自动改写。')+`<section class="suite-card"><h2>当前账期 · 现金变化桥</h2>${bars([['期初资金',db.tradeOpeningCash],['收款合计',t.income],['付款合计',t.out],['期末资金',Math.max(0,t.balance)]])}<p class="suite-help">${money(db.tradeOpeningCash)} + ${money(t.income)} − ${money(t.out)} = ${money(t.balance)}</p></section><section class="suite-card"><h2>历史三大报表 · 2026年5—10月</h2><div class="suite-pill-row">${['income','cashflow','balance'].map((k,i)=>`<button class="statement-detail" data-kind="${k}">${['利润表','现金流量表','资产负债表'][i]} · 查看明细 / 导出</button>`).join('')}</div><p class="suite-help">历史快照包含近三个月、六个月趋势和逐月明细；首页轮播保留三张趋势图。</p></section><section class="suite-card"><h2>导出台账</h2><div class="suite-pill-row">${['收支流水','报销与付款','采购与供应商','工资与薪酬','整车成本 / BOM','项目预算','赞助与应收','SKU 与销售'].map(n=>button(n,'go',n)).join('')}</div></section>`}
  if(current==='飞书 OA'){actions=button('下载导入模板','oaTemplate','','button')+button('导入审批 CSV','oaImport','','button primary');content=note('连接状态：尚未在线接入。当前支持导入飞书审批导出后整理的 CSV，上传后先预览再确认。无需在浏览器填写 App Secret。')+`<div class="suite-split"><section class="suite-card"><h2>审批数据导入</h2><div class="suite-state"><span>1. 从飞书导出审批记录<small>按模板整理，UTF-8 CSV</small></span>${tag('手动导入')}</div><div class="suite-state"><span>2. 检查预览与重复单号<small>无效记录整批阻止；已存在单号跳过</small></span>${tag('导入前校验')}</div><div class="suite-state"><span>3. 进入报销与付款处理<small>已通过 → 待付款；审批中 → 待审批</small></span>${button('打开报销 →','go','报销与付款')}</div></section><section class="suite-card"><h2>后续在线集成</h2><p class="suite-help">需要服务端保管飞书应用凭证、申请审批权限、验证回调签名并保存事件去重记录。当前尚未配置在线连接。</p><p class="suite-help">导入字段：单号、用途、申请人、项目、系统、金额、审批状态。审批状态接受「已通过」「审批中」「已驳回」。</p></section></div>`}
  if(current==='管理设置'){actions=button('导出完整备份','backup','','button')+button('恢复备份','restore','','button')+button('重置工作区','reset','','button');content=metrics([['保存方式','浏览器本地','当前设备与浏览器'],['保存状态',storageOK?'已保存':'需导出备份'],['账期','2026年10月','当前业务账期'],['操作记录',db.audit.length+' 条','最多保留500条']])+`<div class="suite-split"><section class="suite-card"><h2>工作室资料</h2><form id="settingsForm" class="suite-form"><div class="form-grid"><label>工作室名称<input name="name" required maxlength="40" value="${esc(db.settings.name)}"></label><label>操作人名称<input name="owner" required maxlength="40" value="${esc(db.settings.owner)}"></label></div><div class="dialog-actions"><button class="button primary">保存资料</button></div></form><p class="suite-help">当前为单工作室本地空间。操作人名称用于日志记录；登录、多成员权限与云端数据库需在上线阶段接入。</p></section><section class="suite-card"><h2>数据与备份</h2><p class="suite-help">业务修改会保存在当前浏览器。迁移电脑前请导出 JSON 备份。恢复备份会替换当前工作区，导入前会校验结构和金额。</p><p class="suite-help">数据说明：初始业务记录为样例，后续手动录入按工作区记录保留；BOM采用用户提供的E27源表及方案测算。新增的三笔配件采购为样例，单价并非正式供应商报价。历史三大报表是固定样例快照，当前业务操作不改写历史报表。登记付款仅记账，不会向银行或第三方发送付款请求。</p>${button('导出备份','backup','','button')}</section></div><section class="suite-card"><h2>操作日志</h2><div class="suite-log">${db.audit.length?db.audit.map(a=>`<div class="suite-state"><span>${esc(a.action)}<small>${esc(a.user)}</small></span><small>${esc(a.time)}</small></div>`).join(''):'<p class="suite-help">开始操作后会在这里记录。</p>'}</div></section>`}
  if(current==='报表中心')content=tradeUI.render('overview')+content;
  page.innerHTML=`<div class="suite-head"><div><div class="eyebrow">FINANCIAL AURORA / WORKSPACE</div><h1>${esc(current)}</h1><p>${captions[current]}</p></div><div class="suite-actions">${actions}</div></div>${content}<div class="suite-footer-note">${esc(db.settings.name)} · 本地保存</div>`;
 }
 function download(name,text,type='application/json'){const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
 function csvDownload(name,rows){download(name,'\ufeff'+rows.map(r=>r.map(csvCell).join(',')).join('\r\n'),'text/csv;charset=utf-8')}
 function field(name,label,type='text',value='',options){value=value??'';return `<label>${label}${options?`<select name="${name}">${options.map(o=>`<option value="${esc(Array.isArray(o)?o[0]:o)}" ${String(value)===(Array.isArray(o)?o[0]:o)?'selected':''}>${esc(Array.isArray(o)?o[1]:o)}</option>`).join('')}</select>`:`<input name="${name}" type="${type}" required maxlength="120" ${type==='number'?'min="0" max="10000000" step="0.01"':''} value="${esc(value)}">`}</label>`}
 function form(title,kind,fields,id=''){modal(title,`<form id="suiteForm" class="suite-form" data-kind="${kind}" data-id="${esc(id)}"><div class="form-grid">${fields}</div><p class="suite-error" id="formError" role="alert"></p><div class="dialog-actions"><button type="button" class="button" data-close>取消</button><button class="button primary" type="submit">确认保存</button></div></form>`)}
 function newForm(kind,id=''){
 const text=(n,l,v='')=>field(n,l,'text',v),num=(n,l,v='')=>field(n,l,'number',v),opt=(n,l,opts,v='')=>field(n,l,'text',v,opts);
 const common=text('name','名称');
 if(kind==='cash')return $('#addButton').click();
 if(kind==='expense')form('提交报销','expense',text('purpose','用途')+text('person','申请人')+opt('project','归属项目',['AR-26','汽车文化节','工作室运营'])+opt('system','所属系统',['底盘','电驱','车架','空气动力','测试','活动','运营'])+num('amount','金额（元）'));
 if(kind==='supplier')return tradeUI.open('purchaseNew');
 if(kind==='sponsor')form('登记合作',kind,common+opt('kind','支持类型',['现金','实物'])+num('amount','合同金额 / 参考价值')+field('date','计划日期','date','2026-11-10'));
 if(kind==='payroll')form('新增10月工资条',kind,text('name','员工姓名')+opt('role','人员归属',['研发','运营'])+num('base','基本工资')+num('bonus','奖金',0)+num('deduction','扣减',0));
 if(kind==='bom'||kind==='editBom'){const b=db.bom.find(b=>b.id===id);form(b?'编辑零件':'新增零件',kind,text('name','零件名称',b?.name)+opt('system','所属系统',systems.map(s=>s.name),b?.system)+num('qty','数量',b?.qty||1)+num('price','单价',b?.price||'')+text('source','来源单据 / 归集说明',b?.source||'手动归集'),id)}
 if(kind==='sku')form('新增 SKU',kind,common+num('price','销售单价')+num('cost','参考成本',0)+num('stock','初始库存',0));
 if(kind==='sale')return tradeUI.open('saleNew');
 if(kind==='task')form('新增待办',kind,text('name','事项说明'));
 if(kind==='budget')form('调整预算',kind,opt('project','项目',db.budgets.map(b=>b.id))+num('amount','新预算金额',db.budgets[0].amount)+num('committed','未履约采购承诺',db.budgets[0].committed));
 if(kind==='skuFinance'){const sku=db.skus.find(s=>s.id===id);form('商品报价与成本',kind,note('目录参考预算保留原值。修改成本会生成库存成本调整流水，已出库成本保留原快照。')+num('price','工作室销售报价',sku.price)+`<label>单位成本（可留空，表示尚未登记）<input name="cost" type="number" min="0" max="10000000" step="0.01" value="${sku.costConfirmed===false?'':sku.cost}"></label>`,id)}
 if(kind==='stock')return tradeUI.open('adjustStock',id);
 if(kind==='receipt')form('登记票据备注',kind,text('receipt','发票号码 / 收据说明',db.expenses.find(e=>e.id===id)?.receipt||''),id);
 }
 function payment(kind,id){if(kind==='supplierPay')return tradeUI.open('purchasePay',id);if(kind==='salePay')return tradeUI.open('saleCollect',id);let amount=0,title='';if(kind==='supplierPay'){amount=due(db.suppliers.find(s=>s.id===id));title='供应商结款'}if(kind==='sponsorPay'){amount=due(db.sponsors.find(s=>s.id===id));title='赞助回款'}if(kind==='wagePay'){const p=db.payroll.find(p=>p.id===id);amount=payrollNet(p)-p.paid;title='工资发放'}if(kind==='expensePay'){amount=db.expenses.find(e=>e.id===id).amount;title='报销付款'}if(kind==='salePay'){amount=db.sales.find(s=>s.id===id).amount;title='销售收款'}form(title,kind,note('本次登记将关联资金流水。')+field('amount','本次金额（元）','number',amount),id)}
 function onSave(event){const target=event.target;if(['suiteForm','settingsForm'].includes(target.id)&&!ensureFresh()){event.preventDefault();return}if(target.id==='settingsForm'){event.preventDefault();const f=new FormData(target);const name=String(f.get('name')).trim(),owner=String(f.get('owner')).trim();if(!name||!owner)return;db.settings.name=name;db.settings.owner=owner;applyIdentity();commit('更新工作室资料');toast('资料已保存');return}if(target.id!=='suiteForm')return;event.preventDefault();const d=Object.fromEntries(new FormData(target)),kind=target.dataset.kind,id=target.dataset.id;
 try{
 for(const [k,v] of Object.entries(d)){if(kind==='skuFinance'&&k==='cost'&&!v.trim()){d[k]=null;continue}d[k]=v.trim();if(['amount','base','bonus','deduction','qty','price','cost','stock','committed'].includes(k)){d[k]=Number(v);if(!Number.isFinite(d[k])||d[k]<0||d[k]>10000000)throw Error('请输入有效金额或数量')}else if(!d[k])throw Error('请填写所有字段')}
 if(['amount','qty','price'].some(k=>k in d&&d[k]<=0))throw Error('金额、单价和数量必须大于零');
 if('date'in d&&!/^\d{4}-\d{2}-\d{2}$/.test(d.date))throw Error('日期格式无效');
 if(kind==='expense')db.expenses.unshift({id:uid('BX'),...d,state:'review',approval:'审批中'});
 if(kind==='supplier')trade.createPurchase(db,d);
 if(kind==='sponsor')db.sponsors.unshift({id:uid('SP'),...d,paid:0});
 if(kind==='payroll'){if(d.deduction>d.base+d.bonus)throw Error('扣减不能超过应发工资');if(db.payroll.some(p=>p.name===d.name))throw Error('本账期已有该员工工资条');db.payroll.push({id:uid('WG'),...d,paid:0})}
 if(kind==='bom')db.bom.push({id:uid('BOM'),...d});
 if(kind==='editBom')Object.assign(db.bom.find(b=>b.id===id),d);
 if(kind==='sku'){if(!Number.isInteger(d.stock))throw Error('库存必须为整数');db.skus.push({id:uid('SKU'),...d})}
 if(kind==='sale')trade.createSale(db,d);
 if(kind==='skuFinance'){if(d.cost!==null)trade.revalueStock(db,{sku:id,unitCost:d.cost,reason:'工作室库存成本复核'});const sku=db.skus.find(s=>s.id===id);sku.price=d.price;sku.priceConfirmed=true;}
 if(kind==='stock')trade.adjustStock(db,{sku:id,qty:d.qty,unitCost:d.unitCost,reason:d.reason});
 if(kind==='budget'){const b=db.budgets.find(b=>b.id===d.project);b.amount=d.amount;b.committed=d.committed}
 if(kind==='task')db.tasks.unshift({id:uid('TK'),name:d.name,done:false});
 if(kind==='receipt')db.expenses.find(e=>e.id===id).receipt=d.receipt;
 if(['supplierPay','sponsorPay','wagePay','expensePay','salePay'].includes(kind)){
  let item,remaining,type='out',label;
  if(kind==='supplierPay'){item=db.suppliers.find(s=>s.id===id);remaining=due(item);label='供应商结款：'+item.name}
  if(kind==='sponsorPay'){item=db.sponsors.find(s=>s.id===id);remaining=due(item);type='in';label='合作回款：'+item.name}
  if(kind==='wagePay'){item=db.payroll.find(s=>s.id===id);remaining=payrollNet(item)-item.paid;label='工资发放：'+item.name}
  if(kind==='expensePay'){item=db.expenses.find(s=>s.id===id);remaining=item.state==='pending'?item.amount:0;label='报销付款：'+item.purpose;if(d.amount!==remaining)throw Error('报销须一次付清，金额应为 '+money(remaining))}
  if(kind==='salePay'){item=db.sales.find(s=>s.id===id);remaining=item.status==='待收款'?item.amount:0;type='in';label='销售收款：'+item.name;if(d.amount!==remaining)throw Error('销售单须一次收清')}
  if(d.amount>remaining||d.amount<=0)throw Error('本次金额超过剩余款项');
  if(kind==='expensePay'){item.state='paid'}else if(kind==='salePay'){item.status='已收款'}else item.paid=round(item.paid+d.amount);
  flow(type,d.amount,label,id);
 }
 $('#dialog').close();commit('保存'+({'expense':'报销申请','supplier':'采购单','sponsor':'合作','payroll':'工资条','bom':'BOM零件','sale':'销售单','sku':'SKU','budget':'预算调整','stock':'库存入库','receipt':'票据备注'}[kind]||'业务记录'));toast('已保存，关联数据已更新');
 }catch(error){$('#formError').textContent=error.message}}
 function applyIdentity(){const ws=$('.workspace>span:nth-child(2)');ws.innerHTML=esc(db.settings.name)+'<small>2026 赛季 · 工作室</small>';$('.profile>span:nth-child(2)').innerHTML=esc(db.settings.owner)+'<small>工作室管理视角</small>'}
 let pendingImport=[];
 function parseCSV(text){text=text.replace(/^\uFEFF/,'');const rows=[];let row=[],cell='',quoted=false;for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++}else quoted=!quoted}else if(c===','&&!quoted){row.push(cell);cell=''}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(x=>x.trim()))rows.push(row);row=[];cell=''}else cell+=c}if(quoted)throw Error('CSV引号未闭合');row.push(cell);if(row.some(x=>x.trim()))rows.push(row);return rows}
 async function fileInput(backup){const input=document.createElement('input');input.type='file';input.accept=backup?'.json':'.csv';input.onchange=async()=>{try{const file=input.files[0];if(!file)return;if(file.size>5*1024*1024)throw Error('文件不得超过5MB');const text=await file.text();if(backup){const data=validate(JSON.parse(text));modal('恢复工作区备份',note(`将以备份中的 ${data.expenses.length} 笔报销、${data.transactions.length} 笔流水替换当前本地数据及联动报价需求。建议先导出当前备份。`)+button('确认替换当前数据','restoreConfirm','','button primary'));pendingImport=data;return}
 const rows=parseCSV(text),header=rows.shift();if(JSON.stringify(header)!==JSON.stringify(['单号','用途','申请人','项目','系统','金额','审批状态']))throw Error('表头与模板不一致，请先下载模板');if(rows.length>1000||!rows.length)throw Error('请导入1—1000行');const ids=new Set();const imported=rows.map((r,i)=>{const [id,purpose,person,project,system,amount,approval]=r.map(v=>v.trim());if(r.length!==7||r.some(v=>v.length>120)||![id,purpose,person,project,system].every(Boolean)||id.length>100||!Number.isFinite(Number(amount))||Number(amount)<=0||Number(amount)>10000000||!['已通过','审批中','已驳回'].includes(approval))throw Error('第'+(i+2)+'行无效');if(ids.has(id))throw Error('文件中单号重复：'+id);ids.add(id);return {id,purpose,person,project,system,amount:round(Number(amount)),approval,state:approval==='已通过'?'pending':approval==='审批中'?'review':'rejected'}});pendingImport=imported.filter(r=>!db.expenses.some(e=>e.id===r.id));modal('审批导入预览',note(`有效 ${imported.length} 笔；跳过已有单号 ${imported.length-pendingImport.length} 笔；本次新增 ${pendingImport.length} 笔。`)+`<div class="suite-table-scroll"><table class="suite-table"><tbody>${pendingImport.slice(0,10).map(r=>`<tr><td>${esc(r.id)}</td><td>${esc(r.purpose)}</td><td>${money(r.amount)}</td><td>${esc(r.approval)}</td></tr>`).join('')}</tbody></table></div>`+button('确认导入','importConfirm','','button primary'));
 }catch(error){modal('无法导入',`<p class="suite-error">${esc(error.message)}</p>`)}};input.click()}
 document.addEventListener('submit',onSave);
 document.addEventListener('change',event=>{if(event.target.id==='skuCategory'){skuCategory=event.target.value;skuLimit=12;renderPage()}if(event.target.id==='suiteFilter'){filter=event.target.value;renderPage()}if(event.target.closest('#suiteForm')?.dataset.kind==='budget'&&event.target.name==='project'){const b=db.budgets.find(b=>b.id===event.target.value);$('#suiteForm [name="amount"]').value=b.amount;$('#suiteForm [name="committed"]').value=b.committed}});
 document.addEventListener('input',event=>{if(event.target.id==='skuSearch'){const pos=event.target.selectionStart;skuQuery=event.target.value;skuLimit=12;renderPage();$('#skuSearch').focus();$('#skuSearch').setSelectionRange(pos,pos)}if(event.target.id==='suiteSearch'){const pos=event.target.selectionStart;query=event.target.value;renderPage();$('#suiteSearch').focus();$('#suiteSearch').setSelectionRange(pos,pos)}});
 document.addEventListener('click',event=>{
 if(event.target.closest('button')&&!ensureFresh()){event.preventDefault();event.stopImmediatePropagation();return}
 const target=event.target.closest('[data-route],[data-op],[data-suite-bom],[data-action="home"],[data-action="overdue"],[data-action="bom"]');if(!target)return;
 if(target.dataset.route){route(target.dataset.route);return}
 if(target.dataset.suiteBom!==undefined){window.AuroraBOM.selectSystem(systems[Number(target.dataset.suiteBom)]?.id);route('整车成本 / BOM');return}
 if(target.dataset.action){event.stopImmediatePropagation();if($('#dialog').open)$('#dialog').close();route(target.dataset.action==='home'?'财务总览':target.dataset.action==='bom'?'整车成本 / BOM':'采购与供应商');return}
 const op=target.dataset.op,id=target.dataset.id;
 if(op==='go'){if($('#dialog').open)$('#dialog').close();route(id)}
 if(op==='new')newForm(id);
 if(['editBom','stock','receipt','skuFinance'].includes(op))newForm(op,id);
 if(['supplierPay','sponsorPay','wagePay','expensePay','salePay'].includes(op))payment(op,id);
 if(op==='approve'||op==='reject'){const e=db.expenses.find(e=>e.id===id);if(e.state!=='review')return;e.state=op==='approve'?'pending':'rejected';e.approval=op==='approve'?'已通过':'已驳回';commit((op==='approve'?'通过':'驳回')+'报销 '+id)}
 if(op==='receive')tradeUI.open('purchaseReceive',id);
 if(op==='taskToggle'){const t=db.tasks.find(t=>t.id===id);t.done=!t.done;commit((t.done?'完成':'重新打开')+'事项 '+t.name)}
 if(op==='cancelSale')tradeUI.open('saleCancel',id);
 if(op==='linkRefresh')commerce.read().then(mergeRequests).then(()=>publishCommerce()).catch(error=>{linkStatus=error.message;renderPage()});
 if(op==='skuMore'){skuLimit+=12;renderPage()}
 if(op==='skuCatalog'||op==='skuLocal'){skuScope=op==='skuCatalog'?'catalog':'local';skuLimit=12;renderPage()}
 if(op==='skuExport')csvDownload('Aurora_SKU库存.csv',[['商品ID','名称','品牌','分类','目录参考价','工作室报价','成本','库存','计价单位'],...db.skus.map(s=>[s.id,s.name,s.brand||'',s.category||'',s.referencePrice||'',s.price,s.costConfirmed===false?'未登记':s.cost,s.stock,s.unit||'件'])]);
 if(op==='requestConvert')showConversion(id);
 if(op==='requestClose'){const r=db.requests.find(r=>r.id===id);if(r&&r.status==='待报价'){r.status='已关闭';commit('关闭商城需求 '+id)}}
 if(op==='export')csvDownload(current+'.csv',lastRows);
 if(op==='cashExport')$('#exportButton').click();
 if(op==='print')window.print();
 if(op==='backup')download('Financial_Aurora_工作区备份.json',JSON.stringify(db,null,2));
 if(op==='restore')fileInput(true);
 if(op==='restoreConfirm'){try{db=validate(pendingImport);restoreBomWorkspace();pendingImport=[];sync();applyIdentity();$('#dialog').close();commit('恢复工作区备份',true);toast('备份已恢复')}catch(error){toast(error.message)}}
 if(op==='reset')modal('重置全部工作区记录',note('此操作会覆盖当前浏览器内的业务记录、库存、设置与商城报价需求。请先导出备份。')+button('确认重置','resetConfirm','','button primary'));
 if(op==='resetConfirm'){db=seed();window.AuroraBOM.reset(true);sync();applyIdentity();$('#dialog').close();commit('重置工作区',true);toast('已恢复初始工作区')}
 if(op==='oaTemplate')csvDownload('飞书审批导入模板.csv',[['单号','用途','申请人','项目','系统','金额','审批状态'],['FS-DEMO-001','测试材料采购','队员 F','AR-26','底盘',680,'已通过']]);
 if(op==='oaImport')fileInput(false);
 if(op==='importConfirm'){if(!Array.isArray(pendingImport))return;const rows=pendingImport.filter(r=>!db.expenses.some(e=>e.id===r.id));db.expenses.unshift(...rows);pendingImport=[];$('#dialog').close();commit('导入审批 '+rows.length+' 笔');toast('审批已导入')}
 },true);
 document.addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key)&&event.target.matches('[data-suite-bom]')){event.preventDefault();event.target.dispatchEvent(new MouseEvent('click',{bubbles:true}))}});
 $('#resetButton').onclick=()=>route('管理设置');
 $('#addButton').onclick=()=>form('登记10月收支','cashRecord',field('type','方向','text','in',[['in','收款'],['out','付款']])+field('amount','金额（元）','number','')+field('label','用途'));
 
 // Capture cash entries before generic form processing.
 document.addEventListener('submit',event=>{if(event.target.id!=='suiteForm'||event.target.dataset.kind!=='cashRecord')return;event.preventDefault();event.stopImmediatePropagation();if(!ensureFresh())return;const f=new FormData(event.target),amount=round(Number(f.get('amount'))),label=String(f.get('label')).trim(),type=f.get('type');if(!Number.isFinite(amount)||amount<=0||amount>10000000||!label||!['in','out'].includes(type)){return $('#formError').textContent='请填写有效收支记录'}flow(type,amount,label);$('#dialog').close();commit('登记收支：'+label);toast('收支已保存')},true);
 $('#globalSearch').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();event.stopImmediatePropagation();const value=event.target.value;route('报销与付款');query=value;renderPage()}},true);
 window.addEventListener('hashchange',()=>{const name=decodeURIComponent(location.hash.slice(1));route(captions[name]?name:'财务总览')});
 tradeUI=window.AuroraTradeController.create({getDB:()=>db,setDB:value=>{db=value},commit,guard:ensureFresh,route,refresh:()=>{if(current!=='财务总览')renderPage()}});
 window.AuroraBOM.setGuard(ensureFresh);
 document.addEventListener('aurora:bom-view',()=>{if(current==='整车成本 / BOM')renderPage()});
 document.addEventListener('aurora:bom-change',()=>{commit('更新BOM方案口径')});
 commerce.onChange(mergeRequests);
 $('.lab-link').href=commerce.shopURL;$('.lab-link').firstChild.textContent='Aurora 商城 ';
 if(db.bomWorkspace)restoreBomWorkspace();
 sync();applyIdentity();refreshHome();persist();commerce.read().then(mergeRequests).then(publishCommerce).catch(error=>{linkStatus=error.message;if(current==='SKU 与销售')renderPage()});route(decodeURIComponent(location.hash.slice(1)) in captions?decodeURIComponent(location.hash.slice(1)):'财务总览');
 return Object.freeze({version:VERSION});
})();
