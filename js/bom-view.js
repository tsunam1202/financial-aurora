/* Pure BOM view. Source data, scenarios and persistence are owned by the workspace. */
(() => {
 'use strict';
 const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
 const numeric = value => typeof value === 'number' && Number.isFinite(value);
 const sum = values => values.reduce((total, value) => total + (numeric(value) ? value : 0), 0);
 const number = value => numeric(value) ? value.toLocaleString('zh-CN', {maximumFractionDigits:6}) : '未填';
 const palette = ['#702d8d','#a475bc','#d5b36c','#8476a4','#c59bc8','#9b927c','#b8acd0','#775b81','#cdbfa5','#9b7eaa'];
 const colour = (value,index) => /^#[\da-f]{3,8}$/i.test(value || '') ? value : palette[index % palette.length];
 const button = (label, operation, id = '', className = 'text-button') => `<button type="button" class="${className}" data-bomop="${operation}" data-id="${escape(id)}">${label}</button>`;
 const rowType = part => part.type === 'assembly' ? '装配体直接成本' : part.type === 'part' ? '零件' : '计价记录';
 const sourceText = source => {
  if (!source) return '来源未登记';
  return [source.file, source.sheet, source.totalCell || (source.row ? `第 ${source.row} 行` : '')].filter(Boolean).join(' · ');
 };
 function moneyFormatter(currency) {
  const code = currency || '';
  let formatter;
  try { if (/^[A-Z]{3}$/.test(code)) formatter = new Intl.NumberFormat('zh-CN', {style:'currency',currency:code,minimumFractionDigits:2,maximumFractionDigits:2}); } catch {}
  return value => !numeric(value) ? '未填' : formatter ? formatter.format(Math.abs(value)<0.0000001?0:value) : `${value.toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2})}${code ? ' '+escape(code) : ''}`;
 }
 function effective(part, model) {
  const override = model.overrides?.[part.id];
  if (!override) return part.total;
  const quantity = numeric(override.quantity) ? override.quantity : part.quantity;
  const unitCost = numeric(override.unitCost) ? override.unitCost : part.unitCost;
  return numeric(quantity) && numeric(unitCost) ? quantity * unitCost : null;
 }
 function adjustedParts(model) {
  const selected = model.selectedSystem || 'all';
  const query = String(model.search || '').trim().toLowerCase();
  const list = (model.parts || []).filter(part => (selected === 'all' || part.systemId === selected || part.systemName === selected) && [part.code,part.name,part.systemName,part.assembly,part.makeBuy,part.material].join(' ').toLowerCase().includes(query));
  return list.slice().sort(model.sort === 'name' ? (a,b) => String(a.name || '').localeCompare(String(b.name || ''),'zh-CN') : (a,b) => (numeric(effective(b,model)) ? effective(b,model) : -Infinity) - (numeric(effective(a,model)) ? effective(a,model) : -Infinity));
 }
 function metrics(model, money) {
  const parts = model.parts || [], assemblies = parts.filter(p => p.type === 'assembly').length, missing = parts.filter(p => !numeric(p.total)).length;
  const baseline = numeric(model.meta?.sourceTotal) ? model.meta.sourceTotal : sum(parts.map(p => p.total));
  const current = numeric(model.currentTotal) ? model.currentTotal : sum(parts.map(p => effective(p,model)));
  const changed = Object.keys(model.overrides || {}).length;
  const items = [
   ['源表已计价合计',money(baseline),`${parts.length - missing} 条有成本 · ${missing} 条未填`],
   ['当前方案已计价合计',money(current),changed ? `${changed} 条方案调整 · 原表金额保持不变` : '尚未调整方案，使用源表计价'],
   ['层级计价记录',number(parts.length),`${assemblies} 个装配体 · ${parts.length - assemblies} 个零件`],
   ['物料系统',number((model.systems || []).length),`${missing ? missing+' 条缺成本待核对' : '所有层级记录均有成本'} · ${model.meta?.currency || '币种未注明'}`]
  ];
  return `<div class="suite-metrics bom-metrics">${items.map(([label,value,hint])=>`<div class="suite-metric"><span>${label}</span><strong>${value}</strong><small>${escape(hint)}</small></div>`).join('')}</div>`;
 }
 function tabs(model) {
  const active = model.tab || 'overview';
  return `<div class="bom-view-toolbar"><div class="bom-tabs" aria-label="BOM 工作区视图">${[['overview','成本总览'],['parts','层级明细'],['scenario','方案对比'],['sources','来源核对']].map(([id,label])=>`<button type="button" data-bomop="tab" data-value="${id}" aria-pressed="${id===active}" class="${id===active?'active':''}">${label}</button>`).join('')}</div>${button('导出当前明细','export','','button')}</div>`;
 }
 function systemChart(model, money) {
  const systems = model.systems || [], total = sum(systems.map(s=>s.total)), selected = model.selectedSystem || 'all';
  const perimeter = 2*Math.PI*83;
  let offset = 0;
  const segments = systems.map((system,index) => {
   const amount = numeric(system.total) ? Math.max(0,system.total) : 0;
   const length = total > 0 ? amount/total*perimeter : 0;
   const selectedNow = selected === 'all' || selected === system.id || selected === system.name;
   const markup = `<circle class="bom-ring-segment ${selectedNow?'selected':''}" data-bomop="system" data-id="${escape(system.id)}" cx="110" cy="110" r="83" fill="none" stroke="${colour(system.color,index)}" stroke-width="${selected!=='all'&&selectedNow?32:27}" stroke-dasharray="${Math.max(0,length-2)} ${perimeter-Math.max(0,length-2)}" stroke-dashoffset="${-offset}" transform="rotate(-90 110 110)"><title>${escape(system.name)} ${money(system.total)} · ${total>0?(amount/total*100).toFixed(1):'0.0'}%</title></circle>`;
   offset += length;return markup;
  }).join('');
  const active = systems.find(s=>s.id===selected || s.name===selected);
  return `<section class="suite-card bom-system-card"><div class="bom-card-title"><div><span class="bom-kicker">SYSTEM COST DISTRIBUTION</span><h2>系统成本构成</h2></div>${selected!=='all'?button('查看全部系统','system','all'):''}</div><div class="bom-system-layout"><div class="bom-chart-ring"><svg viewBox="0 0 220 220" role="img" aria-label="各系统已计价成本的环形扇形图"><circle cx="110" cy="110" r="83" fill="none" stroke="#f2ecf6" stroke-width="27"/>${segments}</svg><div class="bom-ring-center"><small>${escape(active?.name || '全部系统')}</small><strong>${money(active ? active.total : total)}</strong><span>${active&&total>0?(active.total/total*100).toFixed(1)+'%':'源表分类 · 点击扇区筛选'}</span></div></div><div class="bom-system-legend">${systems.map((system,index)=>{const share=total>0&&numeric(system.total)?system.total/total*100:0;return `<button type="button" data-bomop="system" data-id="${escape(system.id)}" class="${selected===system.id || selected===system.name?'active':''}" aria-pressed="${selected===system.id || selected===system.name}"><i style="background:${colour(system.color,index)}"></i><span>${escape(system.name)}<small>${share.toFixed(1)}% · ${system.count!==undefined?number(system.count)+' 条计价记录':'按源表系统归集'}</small></span><strong>${money(system.total)}</strong></button>`}).join('')}</div></div><p class="bom-chart-foot">系统金额按层级直接成本归集；装配体包含子项的汇总金额不重复加总。</p></section>`;
 }
 function topCosts(model, money) {
  const filtered=adjustedParts({...model,sort:'cost'}).filter(p=>numeric(effective(p,model))), top=filtered.slice(0,10);
  const max=Math.max(1,...top.map(p=>effective(p,model))), denominator=sum(filtered.map(p=>effective(p,model)));
  let cumulative=0;
  return `<section class="suite-card bom-top-card"><div class="bom-card-title"><div><span class="bom-kicker">COST CONCENTRATION</span><h2>成本最高的 10 条计价记录</h2></div><small>累计占比</small></div><div class="bom-cost-ranking">${top.map((part,index)=>{const amount=effective(part,model);cumulative+=amount;return `<div class="bom-rank-row"><span class="bom-rank-number">${String(index+1).padStart(2,'0')}</span><div class="bom-rank-main">${button(escape(part.name||part.code||part.id),'detail',part.id,'bom-rank-name')}<div class="bom-rank-track"><span style="width:${Math.max(0,amount/max*100)}%"></span></div></div><div class="bom-rank-value"><strong>${money(amount)}</strong><small>${denominator>0?(cumulative/denominator*100).toFixed(1):'0.0'}%</small></div></div>`}).join('')||'<p class="bom-empty">当前范围没有可计算的成本。</p>'}</div><p class="bom-chart-foot">占比以当前筛选范围的已计价记录为分母；缺成本记录不作为零成本参与排名。</p></section>`;
 }
 function filters(model) {
  return `<div class="bom-filters"><label class="bom-search"><span>查找计价记录</span><input id="bomSearch" value="${escape(model.search || '')}" type="search" placeholder="零件、装配体、编码、材料…"></label><label><span>所属系统</span><select id="bomSystem"><option value="all">全部系统</option>${(model.systems||[]).map(system=>`<option value="${escape(system.id)}" ${model.selectedSystem===system.id || model.selectedSystem===system.name?'selected':''}>${escape(system.name)}</option>`).join('')}</select></label><label><span>排序</span><select id="bomSort"><option value="cost" ${model.sort!=='name'?'selected':''}>按成本从高到低</option><option value="name" ${model.sort==='name'?'selected':''}>按名称</option></select></label></div>`;
 }
 function partsTable(model,money) {
  const filtered=adjustedParts(model),size=Math.max(1,Number(model.pageSize)||25),pages=Math.max(1,Math.ceil(filtered.length/size)),page=Math.min(pages,Math.max(1,Number(model.page)||1));
  const visible=filtered.slice((page-1)*size,page*size),priced=sum(filtered.map(part=>effective(part,model))),missing=filtered.filter(part=>!numeric(part.total)).length;
  return `<section class="suite-card bom-parts-card"><div class="bom-card-title"><h2>层级计价明细</h2><small>源表金额保留到原单元格精度</small></div>${filters(model)}<div class="bom-table-caption"><span>${filtered.length} 条记录 · ${missing} 条源表成本未填</span><strong>当前范围已计价合计 ${money(priced)}</strong></div><div class="suite-table-scroll bom-table-scroll"><table class="suite-table bom-table"><thead><tr><th>编码 / 名称</th><th>所属系统 / 装配体</th><th>记录类型</th><th class="bom-numeric">数量</th><th class="bom-numeric">单位成本</th><th class="bom-numeric">计价金额</th><th>源表位置</th><th>操作</th></tr></thead><tbody>${visible.map(part=>{const total=effective(part,model),overridden=!!model.overrides?.[part.id];return `<tr class="${!numeric(part.total)?'bom-missing-row':''}"><td class="bom-part-name"><button type="button" data-bomop="detail" data-id="${escape(part.id)}">${escape(part.name||'未命名记录')}</button><small>${escape(part.code||part.id)}</small></td><td>${escape(part.systemName||part.systemId||'未分类')}<small>${escape(part.assembly||'—')}</small></td><td><span class="bom-type ${part.type==='assembly'?'assembly':''}">${rowType(part)}</span>${part.makeBuy?`<small>${escape(part.makeBuy)}</small>`:''}</td><td class="bom-numeric">${number(model.overrides?.[part.id]?.quantity??part.quantity)}${part.unit?`<small>${escape(part.unit)}</small>`:''}</td><td class="bom-numeric" title="原值：${escape(part.unitCost)}">${money(model.overrides?.[part.id]?.unitCost??part.unitCost)}</td><td class="bom-numeric ${!numeric(total)?'bom-missing-value':''}" title="原表金额：${escape(part.total)}"><strong>${money(total)}</strong>${overridden?`<small class="bom-scenario-mark">方案值 · 基准 ${money(part.total)}</small>`:''}</td><td class="bom-source-cell"><span>${escape(part.source?.sheet||'未登记工作表')}</span><small>${escape(part.source?.totalCell|| (part.source?.row?'第 '+part.source.row+' 行':'未登记行号'))}</small></td><td>${button('详情','detail',part.id)}${button('方案调整','edit',part.id)}</td></tr>`}).join('')||'<tr><td colspan="8" class="bom-empty">没有符合筛选条件的记录。</td></tr>'}</tbody></table></div><div class="bom-pagination"><span>显示 ${filtered.length?(page-1)*size+1:0}—${Math.min(page*size,filtered.length)} / ${filtered.length} 条</span><div><button type="button" class="button" data-bomop="prev" ${page<=1?'disabled':''}>上一页</button><strong>${page} / ${pages}</strong><button type="button" class="button" data-bomop="next" ${page>=pages?'disabled':''}>下一页</button></div></div></section>`;
 }
 function scenario(model,money) {
  const parts=model.parts||[],changed=parts.filter(part=>model.overrides?.[part.id]);
  const baseline=numeric(model.meta?.sourceTotal)?model.meta.sourceTotal:sum(parts.map(part=>part.total)),current=numeric(model.currentTotal)?model.currentTotal:sum(parts.map(part=>effective(part,model)));
  const delta=current-baseline,max=Math.max(baseline,current,1);
  return `<section class="suite-card bom-scenario-card"><div class="bom-card-title"><div><span class="bom-kicker">SCENARIO COMPARISON</span><h2>方案成本对比</h2></div>${button('清除方案调整','resetScenario','','button')}</div><div class="bom-scenario-summary"><div><span>源表基准</span><strong>${money(baseline)}</strong></div><div><span>当前方案</span><strong>${money(current)}</strong></div><div class="${delta<=0?'bom-saving':'bom-increase'}"><span>${delta<=0?'较基准减少':'较基准增加'}</span><strong>${money(Math.abs(delta))}</strong><small>${baseline>0?(Math.abs(delta)/baseline*100).toFixed(2)+'%':'基准为零，不计算比例'}</small></div></div><div class="bom-compare-bars"><div><span>源表基准</span><i><b style="width:${Math.max(0,baseline/max*100)}%"></b></i></div><div><span>当前方案</span><i><b style="width:${Math.max(0,current/max*100)}%"></b></i></div></div><p class="bom-inline-note">方案调整保存在本地工作区。原表计价金额保持保留，只有明确录入的方案数量和单位成本用于方案计算。未填成本仍标为未填。</p><div class="suite-table-scroll"><table class="suite-table bom-table"><thead><tr><th>计价记录</th><th>调整后数量</th><th>调整后单位成本</th><th>源表金额</th><th>方案金额</th><th>差额</th><th>操作</th></tr></thead><tbody>${changed.map(part=>{const adjustment=model.overrides[part.id],value=effective(part,model),difference=numeric(value)&&numeric(part.total)?value-part.total:null;return `<tr><td class="bom-part-name">${escape(part.name)}<small>${escape(part.code||part.id)}</small></td><td class="bom-numeric">${number(adjustment.quantity??part.quantity)}</td><td class="bom-numeric">${money(adjustment.unitCost??part.unitCost)}</td><td class="bom-numeric">${money(part.total)}</td><td class="bom-numeric">${money(value)}</td><td class="bom-numeric ${numeric(difference)&&difference<=0?'bom-saving':'bom-increase'}">${numeric(difference)?(difference>0?'+':'−')+money(Math.abs(difference)):'未填'}</td><td>${button('修改方案','edit',part.id)}</td></tr>`}).join('')||'<tr><td colspan="7" class="bom-empty">暂无方案调整。请从层级明细中选择一条记录，调整方案数量或单位成本。</td></tr>'}</tbody></table></div></section>`;
 }
 function sourceReference(model,money) {
  const meta=model.meta||{},parts=model.parts||[],sourceTotal=meta.sourceTotal,detailTotal=numeric(meta.detailTotal)?meta.detailTotal:sum(parts.map(part=>part.total));
  const difference=numeric(sourceTotal)&&numeric(detailTotal)?detailTotal-sourceTotal:null;
  const issues=Array.isArray(model.issues)?model.issues:[];
  const notes=[...(Array.isArray(meta.notes)?meta.notes:[]),...(Array.isArray(model.fca?.notes)?model.fca.notes:[])];
  const fields=[['原表汇总金额',money(sourceTotal)],['层级直接成本明细合计',money(detailTotal)],['明细与原表汇总差额',numeric(difference)?(difference>0?'+':'')+money(difference):'未填'],['缺成本记录',String(parts.filter(part=>!numeric(part.total)).length)+' 条']];
  const files=Array.isArray(meta.files)?meta.files:[];
  return `<div class="bom-source-grid"><section class="suite-card"><div class="bom-card-title"><h2>金额与完整性核对</h2></div>${fields.map(([label,value])=>`<div class="bom-source-line"><span>${label}</span><strong>${value}</strong></div>`).join('')}<p class="bom-inline-note">明细按源表计价金额汇总。数量 × 单位成本仅作为核对，存在差异时不自动改写源表金额。</p></section><section class="suite-card"><div class="bom-card-title"><h2>来源工作簿</h2></div>${files.map(file=>`<div class="bom-source-file"><strong>${escape(file.name||file.file||'未命名工作簿')}</strong>${file.sha256?`<small title="SHA-256">SHA-256 ${escape(file.sha256)}</small>`:''}${file.description?`<p>${escape(file.description)}</p>`:''}</div>`).join('')||'<p class="bom-inline-note">来源文件信息待登记。</p>'}</section></div><section class="suite-card"><div class="bom-card-title"><h2>需要核对的记录</h2><small>${issues.length} 项</small></div>${issues.length?`<div class="bom-issue-list">${issues.map((issue,index)=>`<div class="bom-issue"><span>${String(index+1).padStart(2,'0')}</span><div><strong>${escape(typeof issue==='string'?issue:issue.message||issue.description||issue.type||'需核对事项')}</strong>${typeof issue==='object'&&issue.source?`<small>${escape(sourceText(issue.source))}</small>`:''}${typeof issue==='object'&&issue.partId?button('查看记录','detail',issue.partId):''}</div></div>`).join('')}</div>`:'<p class="bom-inline-note">提取记录中暂无需单独列示的核对事项。</p>'}</section><div class="bom-source-grid"><section class="suite-card"><div class="bom-card-title"><h2>标准表关联</h2></div><div class="bom-reference-count">${number(model.standards?.records?.length||0)}<small>条已提取标准记录</small></div><p class="bom-inline-note">标准费率、材料与工序用于查阅核对。它们不作为额外整车成本再次加总。</p>${referenceSamples(model.standards?.records)}</section><section class="suite-card"><div class="bom-card-title"><h2>FCA 成本分析关联</h2></div><div class="bom-reference-count">${number(model.fca?.records?.length||0)}<small>条已提取关联记录</small></div><p class="bom-inline-note">FCA 的工序、材料与成本依据单独保留。与 BOM 同一成本来源的记录不重复计入整车总额。</p>${referenceSamples(model.fca?.records)}</section></div>${notes.length?`<section class="suite-card"><h2>计价口径与读取说明</h2><ul class="bom-source-notes">${notes.map(note=>`<li>${escape(typeof note==='string'?note:note.message||JSON.stringify(note))}</li>`).join('')}</ul></section>`:''}`;
 }
 function referenceSamples(records) {
  if(!Array.isArray(records)||!records.length)return '';
  return `<div class="bom-reference-samples">${records.slice(0,4).map(record=>`<div><strong>${escape(record.name||record.code||record.title||record.sheet||record.source?.sheet||'关联记录')}</strong><small>${escape(sourceText(record.source||{sheet:record.sheet,row:record.row,file:record.file}))}</small></div>`).join('')}</div>`;
 }
 function render(model={}) {
  const money=moneyFormatter(model.meta?.currency),tab=model.tab||'overview';
  let content;
  if(tab==='sources')content=sourceReference(model,money);
  else if(tab==='scenario')content=scenario(model,money);
  else if(tab==='parts')content=partsTable(model,money);
  else content=`<div class="bom-overview-grid">${systemChart(model,money)}${topCosts(model,money)}</div>${partsTable(model,money)}`;
  return `<div class="bom-workspace">${metrics(model,money)}<div class="bom-source-strip"><span>${escape(model.meta?.title||'整车 BOM')} ${model.meta?.version?'<small>'+escape(model.meta.version)+'</small>':''}</span><span>源表币种：${escape(model.meta?.currency||'未注明')} · 缺失值保留为未填</span></div>${tabs(model)}${content}</div>`;
 }
 window.AuroraBOMView=Object.freeze({render});
})();
