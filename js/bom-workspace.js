/* Source values remain immutable. Local changes are explicitly a planning scenario. */
(() => {
 'use strict';
 const data=window.AuroraBOMData,KEY='aurora-bom-planning-v1';
 if(!data)throw Error('BOM source data must load before the workspace');
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const numeric=v=>typeof v==='number'&&Number.isFinite(v);
 const round=n=>Math.round((n+Number.EPSILON)*100)/100;
 const money=n=>numeric(n)?new Intl.NumberFormat('zh-CN',{style:'currency',currency:data.meta.currency||'CNY',maximumFractionDigits:2}).format(n):'未填';
 const empty=()=>({version:1,datasetVersion:data.meta.version,overrides:{},planActive:false});
 let state=empty(),guard=()=>true;
 let view={tab:'overview',search:'',selectedSystem:'all',sort:'cost',page:1,pageSize:25};
 const byId=new Map(data.parts.map(p=>[p.id,p]));
 function validate(input){
  if(input==null)return empty();
  if(input.version!==1||input.datasetVersion!==data.meta.version||!input.overrides||typeof input.overrides!=='object'||Array.isArray(input.overrides)||typeof input.planActive!=='boolean')throw Error('BOM方案版本或结构不匹配');
  for(const [id,value] of Object.entries(input.overrides)){if(!byId.has(id)||!value||!numeric(value.quantity)||!numeric(value.unitCost)||value.quantity<0||value.quantity>1e7||value.unitCost<0||value.unitCost>1e9)throw Error('BOM方案存在无效数量或单价')}
  return structuredClone(input);
 }
 try{const saved=localStorage.getItem(KEY);if(saved)state=validate(JSON.parse(saved))}catch(error){try{const old=localStorage.getItem(KEY);if(old)localStorage.setItem(KEY+':previous',old)}catch{}state=empty()}
 const emit=(kind='view')=>document.dispatchEvent(new CustomEvent(kind==='cost'?'aurora:bom-change':'aurora:bom-view'));
 function save(){try{localStorage.setItem(KEY,JSON.stringify(state))}catch{toast('BOM方案无法保存，请导出备份')}emit('cost')}
 const scenarioTotal=p=>state.overrides[p.id]?state.overrides[p.id].quantity*state.overrides[p.id].unitCost:p.total;
 function planningTotal(){return data.parts.reduce((total,p)=>total+(numeric(scenarioTotal(p))?scenarioTotal(p):0),0)}
 function total(){return state.planActive?planningTotal():data.meta.sourceTotal}
 function systems(){return data.systems.map(system=>({...system,total:state.planActive?data.parts.filter(p=>p.systemId===system.id).reduce((n,p)=>n+(numeric(scenarioTotal(p))?scenarioTotal(p):0),0):system.total}))}
 function model(){return {...data,...view,currentTotal:planningTotal(),activeTotal:total(),planActive:state.planActive,overrides:state.overrides,systems:systems(),parts:data.parts.map(p=>({...p,scenarioTotal:scenarioTotal(p)}))}}
 function render(){const components=data.meta.componentTotals,names={material:'材料',process:'工序',fastener:'紧固件',tooling:'工具'},colours=['#702d8d','#a275bd','#d6b465','#b9b3ca'];return `<div class="bom-control-strip"><span>首页与预算采用：<b>${state.planActive?'本地方案测算':'源表报告口径'}</b></span><div><button class="button" data-bomop="baseline">使用源表</button><button class="button" data-bomop="applyScenario">应用方案</button></div></div><div class="suite-note">源表已计价 ${money(data.meta.sourceTotal)}，1条总成自身成本未填；四类成本构成重算 ${money(data.meta.componentTotal)}，与源总额差 ${money(data.meta.componentDifference)} 待核对。</div><section class="suite-card bom-cost-components"><h2>源表成本构成</h2><div class="bom-component-stack">${Object.entries(components).map(([key,value],i)=>`<span style="width:${value/data.meta.componentTotal*100}%;background:${colours[i]}" title="${names[key]} ${money(value)}"></span>`).join('')}</div><div class="bom-component-labels">${Object.entries(components).map(([key,value],i)=>`<span><i style="background:${colours[i]}"></i>${names[key]}<strong>${money(value)}</strong></span>`).join('')}</div><small>按源表数量加权；源报告差额20.09元未分摊，方案调整不会自动重算材料与工序标准。</small></section>`+window.AuroraBOMView.render(model())}
 function download(filename,text,type='application/json'){const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
 function exportCSV(){
  const rows=data.parts.filter(p=>(view.selectedSystem==='all'||p.systemId===view.selectedSystem)&&[p.code,p.name,p.systemName,p.assembly,p.material].join(' ').toLowerCase().includes(view.search.toLowerCase()));
  const cell=value=>{let s=String(value??'');if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"'};
  const headers=['稳定记录ID','原编码','名称','层级类型','系统','所属总成','原表数量','原表单价','原表行金额','方案数量','方案单价','方案金额','成本口径','文件','工作表','行号','金额单元格'];
  const values=rows.map(p=>{const override=state.overrides[p.id];return [p.id,p.code,p.name,p.type==='assembly'?'总成自身':'零件',p.systemName,p.assembly,p.quantity,p.unitCost,p.total,override?.quantity??'',override?.unitCost??'',scenarioTotal(p),'原T列报告值；方案改动行=数量×单价',p.source.file,p.source.sheet,p.source.row,p.source.totalCell]});
  download('Aurora_整车BOM_源表与方案.csv','\ufeff'+[headers,...values].map(row=>row.map(cell).join(',')).join('\r\n'),'text/csv;charset=utf-8');
 }
 function detail(id){const p=byId.get(id);if(!p)return;
  const source=p.source;const children=data.parts.filter(part=>part.parentAssemblyId===p.id);
  const costs=Object.entries(p.costs||{}).map(([key,value])=>`<div class="detail-row"><span>${esc(({material:'材料',processing:'工序',fastener:'紧固件',tooling:'工具'})[key]||key)}单位成本</span><strong>${money(value)}</strong></div>`).join('');
  const issues=data.issues.filter(issue=>issue.partId===id||issue.row===source.row);
  const fca=p.fca;
  modal(p.name+' · 成本追溯',`<div class="suite-note">${esc(p.systemName)} · ${esc(p.type==='assembly'?'总成自身直接成本':'零件')}<br>${esc(p.assembly||'无所属总成')} · 原编码 ${esc(p.code)}</div>${[['源表数量',numeric(p.quantity)?p.quantity:'未填'],['源表单位成本',money(p.unitCost)],['源表行金额（T列）',money(p.total)],['数量×单价',numeric(p.quantity)&&numeric(p.unitCost)?money(p.quantity*p.unitCost):'缺输入'],['方案行金额',money(scenarioTotal(p))]].map(([label,value])=>`<div class="detail-row"><span>${label}</span><strong>${esc(value)}</strong></div>`).join('')}${costs}${p.type==='assembly'?`<div class="suite-note">本行只计总成自身直接成本。${children.length} 条直属子项另行计价。直属子件已计价 ${money(p.assemblyChildrenTotal)}；总成含子件已知合计 ${money(p.assemblyTotal)}，该派生合计不再加入整车总额。</div>`:''}${issues.map(i=>`<p class="suite-error">${esc(i.message)}</p>`).join('')}<section class="bom-source-box"><h3>原始位置</h3><p>${esc(source.file)}<br>${esc(source.sheet)} · 第 ${source.row} 行 · ${esc(source.totalCell)}</p>${source.formula?`<p>行金额公式：<code>${esc(source.formula)}</code></p>`:''}${p.raw?`<details><summary>查看源表字段</summary><pre>${esc(JSON.stringify(p.raw,null,2))}</pre></details>`:''}</section>${fca?`<section class="bom-source-box"><h3>FCA 成本卡</h3>${(p.fcaSheets||[]).map(sheet=>`<p><button class="text-button" data-bomref="card" data-id="${esc(sheet)}">${esc(sheet)} · 工艺与材料明细 →</button></p>`).join('')}<p>${esc(fca.sheet)} · ${esc(fca.cell||'N1/N4')}</p><div class="detail-row"><span>卡片单位成本</span><strong>${money(fca.unitCost)}</strong></div><div class="detail-row"><span>卡片数量 / 总成本</span><strong>${esc(fca.quantity??'未填')} / ${money(fca.total)}</strong></div><p class="suite-help">FCA为工艺和成本说明，已通过BOM行计价，不再次加到整车合计。</p></section>`:''}<div class="dialog-actions"><button class="button" data-close>关闭</button><button class="button primary" data-bomop="edit" data-id="${esc(id)}">建立方案调整</button></div>`,'整车成本报告 · 源表与方案分开');
 }
 function edit(id){const p=byId.get(id);if(!p)return;const override=state.overrides[id];modal('方案调整 · '+p.name,`<form id="bomScenarioForm" class="suite-form" data-id="${esc(id)}"><div class="suite-note">保留源表值，另存方案。调整后的本行金额按新数量×新单位成本计算；未调整行继续使用源表T列。保存后会应用到首页BOM与管理预算测算，不登记现金付款。</div><div class="detail-row"><span>源表行金额</span><strong>${money(p.total)}</strong></div><div class="form-grid"><label>方案数量<input name="quantity" required type="number" min="0" max="10000000" step="any" value="${esc(override?.quantity??p.quantity??'')}"></label><label>方案单位成本（元）<input name="unitCost" required type="number" min="0" max="1000000000" step="any" value="${esc(override?.unitCost??p.unitCost??'')}"></label></div><p id="bomFormError" class="suite-error" role="alert"></p><div class="dialog-actions"><button class="button" type="button" data-close>取消</button>${override?`<button class="button" type="button" data-bomop="removeOverride" data-id="${esc(id)}">恢复本行源值</button>`:''}<button class="button primary" type="submit">保存并应用方案</button></div></form>`)}
 document.addEventListener('click',event=>{const button=event.target.closest('[data-bomop]');if(!button)return;if(!guard()){event.preventDefault();event.stopImmediatePropagation();return}event.preventDefault();const op=button.dataset.bomop,id=button.dataset.id;
  if(op==='tab'){view.tab=button.dataset.value;view.page=1;emit()}
  if(op==='system'){view.selectedSystem=id||'all';view.page=1;emit()}
  if(op==='detail')detail(id);
  if(op==='edit')edit(id);
  if(op==='export')exportCSV();
  if(op==='prev'||op==='next'){view.page=Math.max(1,view.page+(op==='prev'?-1:1));emit()}
  if(op==='resetScenario')modal('恢复BOM源表口径',`<div class="suite-note">清除本地方案调整并恢复源表报告值，原Excel和其他财务台账不变。</div><div class="dialog-actions"><button class="button" data-close>取消</button><button class="button primary" data-bomop="confirmReset">确认恢复</button></div>`);
  if(op==='confirmReset'){state=empty();document.querySelector('#dialog').close();save();toast('已恢复源表BOM')}
  if(op==='removeOverride'){delete state.overrides[id];document.querySelector('#dialog').close();save()}
  if(op==='baseline'||op==='applyScenario'){state.planActive=op==='applyScenario';save()}
 },true);
 document.addEventListener('submit',event=>{if(event.target.id!=='bomScenarioForm')return;event.preventDefault();if(!guard())return;try{const f=new FormData(event.target),quantity=Number(f.get('quantity')),unitCost=Number(f.get('unitCost'));if(!numeric(quantity)||!numeric(unitCost)||quantity<0||quantity>1e7||unitCost<0||unitCost>1e9)throw Error('请填写有效数量和单位成本');state.overrides[event.target.dataset.id]={quantity,unitCost};state.planActive=true;document.querySelector('#dialog').close();save();toast('方案已保存，BOM与预算测算已更新')}catch(error){document.querySelector('#bomFormError').textContent=error.message}});
 document.addEventListener('input',event=>{if(event.target.id!=='bomSearch')return;const position=event.target.selectionStart;view.search=event.target.value;view.page=1;emit();const input=document.querySelector('#bomSearch');input?.focus();input?.setSelectionRange(position,position)});
 document.addEventListener('change',event=>{if(event.target.id==='bomSystem'){view.selectedSystem=event.target.value;view.page=1;emit()}if(event.target.id==='bomSort'){view.sort=event.target.value;view.page=1;emit()}});
 window.addEventListener('storage',event=>{if(event.key!==KEY||!event.newValue)return;try{state=validate(JSON.parse(event.newValue));emit('cost')}catch{}});
 window.AuroraBOM=Object.freeze({render,total,systems,model,source:data,detail,validateState:validate,exportState:()=>structuredClone(state),setGuard:fn=>{guard=fn},replaceState:(input,silent=false)=>{state=validate(input);try{localStorage.setItem(KEY,JSON.stringify(state))}catch{}if(!silent)emit('cost')},reset:silent=>{state=empty();try{localStorage.setItem(KEY,JSON.stringify(state))}catch{}if(!silent)emit('cost')},selectSystem:id=>{view.selectedSystem=id||'all';view.tab='parts';view.page=1;emit()}});
})();
