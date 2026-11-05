/* Presentation layer only. Business records remain owned by AuroraSuite. */
(() => {
  'use strict';
  const home=document.querySelector('#home');
  if(!home) return;
  const q=s=>document.querySelector(s);
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  document.body.classList.add('glass-app','home-v2');
  const make=(tag,cls,html='')=>{const el=document.createElement(tag);el.className=cls;el.innerHTML=html;return el};
  const grid=make('div','glass-home-grid'),primary=make('div','glass-primary'),utility=make('aside','glass-utility');
  utility.setAttribute('aria-label','工作动态与快捷操作');
  grid.append(primary,utility);
  const heading=q('.heading');
  const overview=make('section','panel glass-overview',`<div class="glass-overview-body"><div class="glass-balance"><div class="glass-overview-head"><h2>${icon('wallet')}资金总览</h2></div><span>资金余额</span><strong id="glassBalance"></strong><small id="glassOpening"></small></div><div class="glass-orbits"><div class="glass-orbit"><span>本月收款</span><strong id="glassIncome"></strong><small>赞助 · 活动 · 业务回款</small></div><div class="glass-orbit glass-orbit-net"><span>本月净流入</span><strong id="glassNet"></strong><small>收款 − 付款</small></div><div class="glass-orbit"><span>本月付款</span><strong id="glassOut"></strong><small>采购 · 测试 · 运营</small></div></div><div class="glass-overview-actions"></div></div><div class="glass-overview-footer"></div>`);
  overview.id='glassOverview';
  overview.querySelector('.glass-overview-actions').append(heading.querySelector('#exportButton'),heading.querySelector('#addButton'));
  const period=heading.querySelector('.date-chip');period.className='workspace-period';q('.top-actions').prepend(period);
  heading.remove();
  overview.querySelector('.glass-overview-footer').append(q('#stats'));
  primary.append(overview);
  const charts=make('div','glass-chart-pair','<section class="panel" id="motionBars" aria-label="按日期回放收付款对比"></section><section class="panel" id="motionTrend" aria-label="按日期回放资金余额"></section>');
  const tradeSummary=q('#tradeHome');
  primary.append(charts,q('.dashboard-carousel'));
  utility.append(q('.tasks-panel'));
  utility.append(make('section','panel glass-purchase-preview','<div class="panel-heading"><h2>采购配件与付款</h2><button class="text-button" data-module="采购与供应商">全部 →</button></div><div id="glassPurchaseList"></div>'));
  const budgetPanel=q('.budget-panel');
  utility.append(budgetPanel);
  const budgetDetails=make('details','glass-budget-details','<summary>各项目预算明细</summary>');
  budgetDetails.append(budgetPanel.querySelector('.budget-rows'));budgetPanel.append(budgetDetails);
  const quick=make('section','panel glass-quick',`<div class="panel-heading"><h2>${icon('plus')}快捷操作</h2></div><div class="glass-quick-grid">${[['采购与供应商','package','采购'],['库存台账','layers','库存'],['SKU 与销售','flag','销售'],['报销与付款','receipt','报销']].map(([route,i,label])=>`<button data-module="${route}" aria-label="打开${route}">${icon(i)}<span>${label}</span></button>`).join('')}</div><button class="glass-feishu" data-module="飞书 OA">${icon('external')}飞书 OA <small>尚未接入</small>${icon('chevron')}</button>`);
  utility.append(quick,tradeSummary,primary.querySelector('.sponsor-panel'));
  const legacy=q('.analysis-grid');legacy.classList.add('glass-legacy');legacy.hidden=true;
  // Keep original chart nodes for existing consumers and exports; new visual charts share their source.
  const footer=q('#home > .page-footer');home.insertBefore(grid,footer);
  const vehicle=make('div','glass-vehicle-container');vehicle.id='vehicleShowcase';
  const studio=q('.studio-panel');studio.querySelector('.studio-car').hidden=true;
  studio.insertBefore(vehicle,studio.querySelector('.recent-header'));
  const recent=make('section','panel glass-recent');recent.id='homeRecentActivity';recent.append(studio.querySelector('.recent-header'),studio.querySelector('.activity-list'));utility.append(recent);
  studio.querySelector('h2').remove();studio.querySelector('.studio-top').remove();
  const bomShowcase=make('div','glass-bom-showcase');bomShowcase.id='bomShowcase';bomShowcase.hidden=true;q('.bom-panel').insertBefore(bomShowcase,q('.bom-footer'));
  window.AuroraVehicle?.mount(vehicle);
  window.AuroraVehicle?.mountBOM(bomShowcase);
  window.AuroraMotionCharts?.mount('#motionBars','#motionTrend');

  function refresh(){
    const t=totals();
    for(const [id,val] of [['glassBalance',t.balance],['glassIncome',t.income],['glassNet',t.net],['glassOut',t.out]])q('#'+id).textContent=money(val);
    q('#glassOpening').textContent='期初资金 '+money(openingCash());
    q('#glassPurchaseList').innerHTML=q('#supplierList').innerHTML;
    window.AuroraMotionCharts?.refresh();
  }
  window.AuroraGlass=Object.freeze({refresh});refresh();
  document.addEventListener('aurora:finance-updated',refresh);

  // A spring-like selection pill moves between navigation items without replacing their labels.
  const nav=q('#navigation'),marker=make('span','glass-nav-marker');marker.setAttribute('aria-hidden','true');nav.prepend(marker);
  const shortLabels={'财务总览':'首页','待办中心':'待办','收支流水':'流水','报销与付款':'报销','采购与供应商':'采购','库存台账':'库存','SKU 与销售':'销售','业务联动':'联动','赞助与应收':'赞助','整车成本 / BOM':'成本','项目预算':'预算','工资与薪酬':'工资','研发成本':'研发','报表中心':'报表','飞书 OA':'飞书','管理设置':'设置'};
  function labelInRail(el,word){el.dataset.short=word;el.removeAttribute('data-tip');el.removeAttribute('title');const label=make('span','nav-short-label',word);label.setAttribute('aria-hidden','true');el.append(label);}
  nav.querySelectorAll('.nav-item').forEach(b=>{const route=b.dataset.route;b.setAttribute('aria-label',route);[...b.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE).forEach(n=>n.remove());labelInRail(b,shortLabels[route]||route.slice(0,2));});
  q('.brand').setAttribute('aria-label','Financial Aurora · 返回财务总览');
  labelInRail(q('.brand'),'首页');
  q('.brand').addEventListener('click',e=>{e.preventDefault();showModule('财务总览')});
  labelInRail(q('.lab-link'),'商城');labelInRail(q('.feishu'),'飞书');labelInRail(q('.profile'),'设置');
  function navMarker(){const active=nav.querySelector('.nav-item.active');if(!active)return;marker.style.height=active.offsetHeight+'px';marker.style.transform=`translateY(${active.offsetTop}px)`;}
  function routeMotion(){
    navMarker();hideTip();
    const page=home.hidden?q('#suitePage'):grid;
    if(!reduced.matches)page.animate([{opacity:.25,transform:'translateY(9px)',filter:'blur(3px)'},{opacity:1,transform:'translateY(0)',filter:'blur(0)'}],{duration:360,easing:'cubic-bezier(.2,.7,.2,1)'});
  }
  document.addEventListener('aurora:route',routeMotion);
  window.addEventListener('resize',navMarker);navMarker();
  new ResizeObserver(navMarker).observe(nav);
  nav.addEventListener('pointerover',()=>requestAnimationFrame(navMarker));nav.addEventListener('pointerout',()=>requestAnimationFrame(navMarker));
  nav.addEventListener('transitionend',navMarker);nav.addEventListener('focusin',()=>requestAnimationFrame(navMarker));nav.addEventListener('focusout',()=>requestAnimationFrame(navMarker));
  const tip=make('div','glass-tooltip');tip.id='glassTooltip';tip.setAttribute('role','tooltip');tip.hidden=true;document.body.append(tip);
  let tipOwner=null;
  function hideTip(){tip.hidden=true;if(tipOwner)tipOwner.removeAttribute('aria-describedby');tipOwner=null;}
  function showTip(el){
    const label=el.dataset.tip||el.getAttribute('aria-label');if(!label)return;
    hideTip();tipOwner=el;tip.textContent=label;tip.hidden=false;el.setAttribute('aria-describedby',tip.id);
    const r=el.getBoundingClientRect(),w=tip.offsetWidth,h=tip.offsetHeight;
    const rail=!!el.closest('.sidebar');
    tip.style.left=Math.max(8,Math.min(innerWidth-w-8,rail?r.right+12:r.left+r.width/2-w/2))+'px';
    tip.style.top=Math.max(8,Math.min(innerHeight-h-8,rail?r.top+(r.height-h)/2:r.bottom+10))+'px';
  }
  const tipTarget=t=>t.closest('.sidebar')?null:t.closest('[data-tip],button[aria-label]');
  document.addEventListener('pointerover',e=>{const el=tipTarget(e.target);if(el)showTip(el)});
  document.addEventListener('pointerout',e=>{if(tipOwner&&!tipOwner.contains(e.relatedTarget))hideTip()});
  document.addEventListener('focusin',e=>{const el=tipTarget(e.target);if(el)showTip(el)});
  document.addEventListener('focusout',hideTip);window.addEventListener('scroll',hideTip,true);
  document.addEventListener('keydown',e=>{if(e.key==='Escape')hideTip()});

  requestAnimationFrame(()=>window.dispatchEvent(new Event('resize')));
})();
