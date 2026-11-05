'use strict';
// Fixed illustrative closed-period accounts. Monetary values are yuan.
// Statement definitions: https://www.sec.gov/about/reports-publications/beginners-guide-financial-statements
// No real accounting or tax treatment is inferred from the homepage cash-entry demo.
(()=>{
 const opening={cash:60000,receivables:10000,inventory:20000,fixed:110000,payables:25000,debt:30000,equity:145000};
 const inputs=[
  {month:5,revenue:42000,cogs:26000,tax:0,operating:-5000,investing:-10000,financing:20000,receivables:14000,inventory:25000,payables:29000,depreciation:2000},
  {month:6,revenue:56000,cogs:31000,tax:1200,operating:8000,investing:-15000,financing:10000,receivables:18000,inventory:30000,payables:32000,depreciation:2200},
  {month:7,revenue:68000,cogs:36000,tax:2400,operating:18000,investing:-8000,financing:-5000,receivables:24000,inventory:34000,payables:35000,depreciation:2400},
  {month:8,revenue:74000,cogs:42000,tax:1500,operating:12000,investing:-10000,financing:0,receivables:30000,inventory:37000,payables:39000,depreciation:2600},
  {month:9,revenue:82000,cogs:45000,tax:2600,operating:23000,investing:-8000,financing:0,receivables:36000,inventory:40000,payables:43000,depreciation:2800},
  {month:10,revenue:96000,cogs:50000,tax:3400,operating:38640,investing:0,financing:0,receivables:36000,inventory:36000,payables:41080,depreciation:3000}
 ];
 let previous=opening;
 const rows=inputs.map(input=>{
  const d={...input};d.profit=d.operating-d.depreciation+(d.receivables-previous.receivables)+(d.inventory-previous.inventory)-(d.payables-previous.payables);
  d.expenses=d.revenue-d.cogs-d.tax-d.profit;d.margin=d.profit/d.revenue*100;d.openingCash=previous.cash;d.netCash=d.operating+d.investing+d.financing;d.cash=previous.cash+d.netCash;
  d.fixed=previous.fixed-d.investing-d.depreciation;d.debt=previous.debt+d.financing;d.assets=d.cash+d.receivables+d.inventory+d.fixed;d.liabilities=d.payables+d.debt;d.equity=previous.equity+d.profit;d.debtRatio=d.liabilities/d.assets*100;d.equityOpening=previous.equity;
  previous=d;return Object.freeze(d);
 });
 window.FinancialStatements=Object.freeze({opening:Object.freeze(opening),rows:Object.freeze(rows)});
 const themes={income:{title:'利润表',en:'INCOME STATEMENT',icon:'activity',metric:'10月净利润',value:'profit',sub:d=>'净利率 '+d.margin.toFixed(1)+'%',series:[['revenue','营业收入','#8b55a5'],['profit','净利润','#d2ae62']]},cashflow:{title:'现金流量表',en:'CASH FLOW',icon:'wallet',metric:'10月经营净现金流',value:'operating',sub:d=>'期末现金 '+money(d.cash),series:[['operating','经营','#82509b'],['investing','投资','#c2a4d3'],['financing','筹资','#d2ae62']]},balance:{title:'资产负债表',en:'BALANCE SHEET',icon:'layers',metric:'10月资产总额',value:'assets',sub:d=>'资产负债率 '+d.debtRatio.toFixed(1)+'%',series:[['assets','资产','#7b3d96'],['liabilities','负债','#c4a0d6'],['equity','净资产','#c7a254']]}};
 let range=6;
 const wan=n=>(n/10000).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2}),pct=n=>n.toFixed(1)+'%';
 function chart(kind,visible,W,H){
  const cfg=themes[kind],L=27,R=7,T=9,B=22,w=W-L-R,h=Math.max(12,H-T-B);
  const values=visible.flatMap(d=>cfg.series.map(([key])=>d[key]));const quantum=kind==='balance'?100000:20000;
  const max=Math.max(quantum,Math.ceil(Math.max(...values)/quantum)*quantum),min=Math.min(0,Math.floor(Math.min(...values)/quantum)*quantum),y=v=>T+h-(v-min)/(max-min)*h,step=w/visible.length,x=i=>L+step*(i+.5);
  let svg='';
  const tickStep=kind==='balance'?100000:kind==='income'?20000:10000;
  const ticks=[];for(let value=min;value<=max;value+=tickStep)ticks.push(value);
  // Keep at least three readable labels in the compact desktop plot; retain
  // the original bounds and zero baseline even when intermediate ticks hide.
  const tickCount=Math.min(ticks.length,Math.max(3,Math.min(7,Math.floor(h/25)+1)));
  const shown=new Set(Array.from({length:tickCount},(_,i)=>Math.round(i*(ticks.length-1)/(tickCount-1))));
  ticks.forEach((value,index)=>{if(!shown.has(index)&&value!==0)return;const Y=y(value);svg+=`<line x1="${L}" y1="${Y}" x2="${W-R}" y2="${Y}" stroke="${value===0?'#cec2d7':'#eee9f2'}" ${value===0?'':'stroke-dasharray="3 4"'}/>`;if(shown.has(index))svg+=`<text class="statement-y-label" x="${L-6}" y="${Y+3.5}" text-anchor="end" fill="#a895b5" font-size="11">${(value/10000).toLocaleString('zh-CN',{maximumFractionDigits:1})}</text>`});
  if(kind==='balance'){
   cfg.series.forEach(([key,label,color])=>{const line=visible.map((d,i)=>(i?'L':'M')+x(i)+','+y(d[key])).join(' ');svg+=`<path d="${line}" fill="none" stroke="${color}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`;visible.forEach((d,i)=>svg+=`<circle cx="${x(i)}" cy="${y(d[key])}" r="3" fill="white" stroke="${color}" stroke-width="1.7"/>`)});
  }else{
   const n=cfg.series.length,bw=Math.min(14,step/(n+1.7)),gap=3;
   visible.forEach((d,i)=>cfg.series.forEach(([key,label,color],j)=>{const v=d[key],height=Math.abs(y(v)-y(0)),left=x(i)-(n*bw+(n-1)*gap)/2+j*(bw+gap);svg+=`<rect x="${left}" y="${Math.min(y(v),y(0))}" width="${bw}" height="${Math.max(v===0?1:2,height)}" rx="2" fill="${color}" opacity="${v===0?.45:1}"/>` }));
  }
  visible.forEach((d,i)=>{svg+=`<text x="${x(i)}" y="${H-8}" text-anchor="middle" class="statement-x-label" fill="#a895b5" font-size="11">${d.month}月</text><rect class="statement-hit" data-month="${d.month}" data-kind="${kind}" tabindex="0" role="button" aria-label="查看${d.month}月${cfg.title}数据" x="${x(i)-step/2+1}" y="${T-2}" width="${step-2}" height="${h+4}" fill="transparent"/>`});
  return `<svg viewBox="0 0 ${W} ${H}" role="group" aria-label="${cfg.title}月度趋势，单位万元">${svg}</svg>`;
 }
 const chartSizes=new WeakMap(),pendingCharts=new Set();let resizeFrame=0;
 const resizeCharts=typeof ResizeObserver==='function'?new ResizeObserver(entries=>{
  entries.forEach(entry=>pendingCharts.add(entry.target));
  if(resizeFrame)return;
  resizeFrame=requestAnimationFrame(()=>{resizeFrame=0;const charts=[...pendingCharts];pendingCharts.clear();charts.forEach(drawChart)});
 }):null;
 function drawChart(wrap){
  if(!wrap.isConnected)return;
  const box=wrap.getBoundingClientRect(),W=Math.round(box.width*2)/2,H=Math.round(box.height*2)/2;
  if(W<1||H<1)return;
  const size=`${W}:${H}:${range}`;if(chartSizes.get(wrap)===size)return;
  const focused=wrap.contains(document.activeElement)?document.activeElement.dataset.month:null;
  chartSizes.set(wrap,size);wrap.innerHTML=chart(wrap.closest('[data-statement]').dataset.statement,rows.slice(-range),W,H);
  bindChart(wrap);
  if(focused)wrap.querySelector(`[data-month="${focused}"]`)?.focus({preventScroll:true});
 }
 function renderStatements(){
  resizeCharts?.disconnect();cancelAnimationFrame(resizeFrame);resizeFrame=0;pendingCharts.clear();
  const visible=rows.slice(-range),last=rows.at(-1),prior=rows.at(-2);
  $('#statementPeriod').textContent=`2026年${visible[0].month}—10月`;
  $('#statementCards').innerHTML=Object.entries(themes).map(([kind,cfg])=>{
   const delta=last[cfg.value]-prior[cfg.value];
   return `<article class="panel statement-card" data-statement="${kind}"><div class="statement-card-head"><div><span class="statement-en">${cfg.en}</span><h3>${icon(cfg.icon)}${cfg.title}</h3></div><button class="text-button statement-detail" data-kind="${kind}">明细 ${icon('arrow')}</button></div><div class="statement-primary"><div><span>${cfg.metric}</span><strong>${wan(last[cfg.value])}<small>万元</small></strong></div><div class="statement-secondary"><b>${cfg.sub(last)}</b><small>较上月 ${delta>=0?'+':'−'}${wan(Math.abs(delta))} 万元</small></div></div><div class="statement-legend">${cfg.series.map(([key,label,color])=>`<span><b style="background:${color}"></b>${label}</span>`).join('')}<small>万元</small></div><div class="statement-chart"></div><div class="statement-insight">${kind==='income'?'<b class="dot green"></b>5月亏损，6月起转正':kind==='cashflow'?'<b class="dot gold-dot"></b>投资、筹资与经营活动分开统计':'<b class="dot muted"></b>各月资产 = 负债 + 净资产'}</div></article>`;
  }).join('');
  document.querySelectorAll('#statementCards .statement-chart').forEach(wrap=>{drawChart(wrap);resizeCharts?.observe(wrap)});
  document.querySelectorAll('.statement-detail').forEach(b=>b.onclick=()=>detail(b.dataset.kind));
 }
 function bindChart(chartWrap){
  chartWrap.querySelectorAll('.statement-hit').forEach(hit=>{
   const show=()=>{document.querySelectorAll('.statement-tooltip').forEach(t=>t.remove());const d=rows.find(r=>r.month===+hit.dataset.month),cfg=themes[hit.dataset.kind],wrap=hit.closest('.statement-chart'),tip=document.createElement('div');tip.className='statement-tooltip';tip.innerHTML=`<strong>2026年${d.month}月${hit.dataset.kind==='balance'?'末':''}</strong>${cfg.series.map(([key,l,c])=>`<span><i style="background:${c}"></i>${l}<b>${money(d[key])}</b></span>`).join('')}<small>${hit.dataset.kind==='income'?'净利率 '+pct(d.margin):hit.dataset.kind==='cashflow'?'期末现金 '+money(d.cash):'资产负债率 '+pct(d.debtRatio)}</small>`;wrap.append(tip);const relative=hit.getBoundingClientRect().left-wrap.getBoundingClientRect().left;tip.style.left=Math.max(4,Math.min(relative-45,wrap.clientWidth-207))+'px';tip.style.top='0px';};
   hit.addEventListener('pointerenter',show);hit.addEventListener('focus',show);hit.addEventListener('pointerleave',()=>hit.closest('.statement-chart').querySelector('.statement-tooltip')?.remove());hit.addEventListener('blur',()=>hit.closest('.statement-chart').querySelector('.statement-tooltip')?.remove());hit.addEventListener('click',show);hit.addEventListener('keydown',e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();detail(hit.dataset.kind)}});
  });
 }
 function detail(kind){
  const cfg=themes[kind],visible=rows.slice(-range);
  const cols=kind==='income'?[['revenue','营业收入'],['cogs','营业成本'],['expenses','期间费用'],['tax','税费'],['profit','净利润']]:kind==='cashflow'?[['openingCash','期初现金'],['operating','经营净流量'],['investing','投资净流量'],['financing','筹资净流量'],['netCash','净增加额'],['cash','期末现金']]:[['cash','货币资金'],['receivables','应收款'],['inventory','存货'],['fixed','固定资产净值'],['assets','资产合计'],['liabilities','负债合计'],['equity','净资产']];
  modal(cfg.title+' · 月度明细',`<div class="dialog-note">2026年${visible[0].month}—10月 · 单位：万元<br>历史已结账快照；当前工作区的收付款登记不改写历史报表。</div><div class="statement-table-wrap"><table class="statement-table"><thead><tr><th>项目</th>${visible.map(d=>`<th>${d.month}月${kind==='balance'?'末':''}</th>`).join('')}</tr></thead><tbody>${cols.map(([key,l])=>`<tr class="${['profit','netCash','cash','assets','equity'].includes(key)?'emphasis':''}"><th>${l}</th>${visible.map(d=>`<td class="${d[key]<0?'negative':''}">${wan(d[key])}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="statement-formula">${kind==='income'?'净利润 = 营业收入 − 营业成本 − 期间费用 − 税费。':kind==='cashflow'?'期末现金 = 期初现金 + 经营净流量 + 投资净流量 + 筹资净流量。':'资产 = 负债 + 净资产；本期净资产 = 上期净资产 + 本期净利润（本示例无分红、无权益融资）。'}</p><div class="dialog-actions"><button class="button" id="statementExport">导出本表 CSV</button><button class="button primary" data-close>关闭</button></div>`);
  $('#statementExport').onclick=()=>{const content=[['Financial Aurora '+cfg.title+'（历史样例快照，单位万元）'],['项目',...visible.map(d=>'2026年'+d.month+'月')],...cols.map(([k,l])=>[l,...visible.map(d=>(d[k]/10000).toFixed(2))])].map(row=>row.map(csvCell).join(',')).join('\r\n');const url=URL.createObjectURL(new Blob(['\ufeff'+content],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='Financial_Aurora_'+cfg.title+'_月度明细.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('月度报表已导出')};
 }
 document.addEventListener('click',e=>{const b=e.target.closest('#suitePage .statement-detail');if(b)detail(b.dataset.kind)});
 $('#statementRange').addEventListener('click',e=>{const b=e.target.closest('[data-range]');if(!b)return;range=Number(b.dataset.range);$('#statementRange').querySelectorAll('button').forEach(btn=>{const active=+btn.dataset.range===range;btn.classList.toggle('active',active);btn.setAttribute('aria-pressed',active)});renderStatements()});
 renderStatements();
})();
