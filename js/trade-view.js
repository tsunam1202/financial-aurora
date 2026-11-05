/* Pure business-workflow views. The transaction engine owns values and state changes. */
(() => {
  'use strict';
  const tabs = [['overview', '业务总览'], ['purchases', '采购与应付'], ['inventory', '库存与出入库'], ['sales', '销售与应收'], ['ledger', '资金与单据追溯']];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const numeric = value => typeof value === 'number' && Number.isFinite(value);
  const amount = value => numeric(value) ? new Intl.NumberFormat('zh-CN', {style:'currency', currency:'CNY', minimumFractionDigits:2, maximumFractionDigits:2}).format(Math.abs(value) < 1e-8 ? 0 : value) : '未确认';
  const number = value => numeric(value) ? value.toLocaleString('zh-CN', {maximumFractionDigits:4}) : '未确认';
  const rounded = value => Math.round((value + Number.EPSILON) * 100) / 100;
  const sum = values => values.reduce((total, value) => total + (numeric(value) ? value : 0), 0);
  const button = (label, operation, id = '', className = 'text-button', type = '') => `<button type="button" class="${className}" data-tradeop="${operation}" data-id="${esc(id)}"${type ? ` data-type="${esc(type)}"` : ''}>${label}</button>`;
  const pill = (label, tone = '') => `<span class="trade-pill ${tone}">${esc(label)}</span>`;
  const empty = (columns, copy) => `<tr><td colspan="${columns}" class="suite-empty">${copy}</td></tr>`;
  const getSKU = (model, id) => (model.db?.skus || []).find(sku => sku.id === id);
  const searchMatch = (values, query) => values.join(' ').toLowerCase().includes(String(query || '').trim().toLowerCase());
  const remaining = (total, paid) => numeric(total) && numeric(paid) ? Math.max(0, rounded(total - paid)) : null;
  const available = (model, sku) => {
    const values = model.availableBySku;
    const value = values instanceof Map ? values.get(sku.id) : values?.[sku.id];
    return numeric(value) ? value : null;
  };
  const stockName = (model, id) => getSKU(model, id)?.name || id || '未关联 SKU';
  const purchaseAP = purchase => remaining(numeric(purchase.receivedAmount) ? purchase.receivedAmount : purchase.openingPayable ? purchase.amount : 0, purchase.paid || 0);
  const saleCollected = sale => numeric(sale.collected) ? sale.collected : sale.status === '已收款' ? sale.amount : 0;
  const saleShippedQty = sale => numeric(sale.shippedQty) ? sale.shippedQty : sale.legacy ? sale.qty : 0;
  const saleShippedAmount = sale => numeric(sale.shippedAmount) ? sale.shippedAmount : sale.legacy ? sale.amount : 0;
  const saleAR = sale => remaining(saleShippedAmount(sale), saleCollected(sale));
  const saleAdvance = sale => remaining(saleCollected(sale), saleShippedAmount(sale));

  function metricCards(items, className = '') {
    return `<div class="suite-metrics trade-metrics ${className}">${items.map(([label, value, hint = '', tone = '']) => `<div class="suite-metric ${tone}"><span>${label}</span><strong>${value}</strong><small>${hint}</small></div>`).join('')}</div>`;
  }

  function topMetrics(model) {
    const s = model.summary || {};
    return metricCards([
      ['采购应付余额', amount(s.ap), '按已收货确认，扣除已付金额'],
      ['销售应收余额', amount(s.ar), '按已交付金额，扣除已收款'],
      ['库存账面价值', amount(s.inventoryValue), s.inventoryUnknownCount ? `${number(s.inventoryUnknownCount)} 项库存成本待确认` : '采购入库增加，销售出库结转'],
      ['当前资金余额', amount(s.cash), '由期初资金与同一份收付款流水计算', 'trade-cash-metric']
    ]);
  }

  function toolbar(model) {
    const active = model.tab || 'overview';
    return `<div class="trade-toolbar"><div class="trade-tabs" aria-label="业务联动视图">${tabs.map(([id, label]) => `<button type="button" data-tradeop="tab" data-value="${id}" aria-pressed="${active === id}" class="${active === id ? 'active' : ''}">${label}</button>`).join('')}</div>${button('导出当前台账', 'export', '', 'button')}</div><div class="suite-tools trade-search"><input id="tradeSearch" type="search" aria-label="查询业务单据、SKU或往来方" placeholder="搜索单号、SKU、供应商或客户…" value="${esc(model.search || '')}"><small>同一单据贯穿库存、往来与收付款</small></div>`;
  }

  function workflow() {
    const stages = [
      ['01', '采购下单', '确认 SKU、数量和采购单价', 'purchases'],
      ['02', '收货入库', '增加库存，确认对应应付', 'inventory'],
      ['03', '供应商付款', '减少应付，形成付款流水', 'ledger'],
      ['04', '销售与预占', '创建订单，预留可售数量', 'sales'],
      ['05', '出库交付', '减少实物库存，结转成本', 'inventory'],
      ['06', '客户回款', '减少应收，形成收款流水', 'ledger']
    ];
    return `<section class="trade-flow" aria-label="采购库存销售财务业务流程">${stages.map(([n, title, note, target]) => `<button type="button" data-tradeop="tab" data-value="${target}"><small>${n}</small><strong>${title}</strong><span>${note}</span></button>`).join('')}</section>`;
  }

  function procurement(model, embedded = false) {
    const all = model.db?.suppliers || [];
    const records = all.filter(p => searchMatch([p.id, p.name, p.item, p.sku, stockName(model, p.sku)], model.search));
    const rows = records.map(p => {
      const linked = !!p.sku && !p.openingPayable;
      const receivedQty = numeric(p.receivedQty) ? p.receivedQty : 0;
      const unreceived = linked && numeric(p.qty) ? Math.max(0, p.qty - receivedQty) : 0;
      const payable = purchaseAP(p);
      const progress = linked && p.qty > 0 ? Math.min(100, receivedQty / p.qty * 100) : 0;
      return `<tr><td><strong>${esc(p.name)}</strong><small>${esc(p.id)}</small><small>计划付款 ${esc(p.date || '未设置')}</small></td><td class="trade-product-cell">${linked ? `${esc(stockName(model, p.sku))}<small>${esc(p.sku)} · 单价 ${amount(p.unitCost)}</small>` : `${pill('期初应付', 'neutral')}<small>${esc(p.item || '原有往来余额')}</small><small>未关联 SKU，不生成实物库存</small>`}</td><td>${linked ? `<strong>${number(receivedQty)} / ${number(p.qty)}</strong><small>${unreceived > 0 ? '待收货 '+number(unreceived) : '已全部收货'}</small><div class="trade-progress"><span style="width:${progress}%"></span></div>` : '期初余额'}</td><td class="trade-number">${amount(p.amount)}</td><td class="trade-number">${amount(numeric(p.receivedAmount) ? p.receivedAmount : p.openingPayable ? p.amount : 0)}<small>${linked ? '已收货对应金额' : '期初确认应付'}</small></td><td class="trade-number">${amount(p.paid || 0)}<small class="${payable > 0 ? 'trade-amber' : 'trade-green'}">待付 ${amount(payable)}</small></td><td><div class="trade-row-actions">${unreceived > 0 ? button('收货入库', 'purchaseReceive', p.id) : ''}${payable > 0 ? button('登记付款', 'purchasePay', p.id) : ''}${button('单据追溯', 'detail', p.id, 'text-button', 'purchase')}</div></td></tr>`;
    }).join('');
    return `<section class="suite-card trade-purchase-card"><div class="trade-card-heading"><div><span class="trade-kicker">PURCHASE TO PAY</span><h2>采购单、收货与应付</h2></div>${button('+ 新建 SKU 采购', 'purchaseNew', '', 'button primary')}</div>${!embedded ? `<p class="trade-explanation">下单形成采购承诺；收货才增加实物库存并确认应付；登记付款只减少应付与现金。每次入库、付款均保留采购单号。</p>` : ''}<div class="suite-table-scroll"><table class="suite-table trade-table"><thead><tr><th>供应商 / 采购单</th><th>SKU / 采购内容</th><th>收货数量</th><th class="trade-number">合同总额</th><th class="trade-number">已确认应付</th><th class="trade-number">累计已付 / 剩余</th><th>操作</th></tr></thead><tbody>${rows || empty(7, '暂无匹配采购单。新建采购单并收货后，库存和应付会从同一单据更新。')}</tbody></table></div><div class="trade-table-foot"><span>${records.length} 笔采购记录</span><span>采购未收货承诺 <strong>${amount(model.summary?.commitment)}</strong></span></div></section>`;
  }

  function renderSales(model = {}) {
    const all = model.db?.sales || [];
    const records = all.filter(s => searchMatch([s.id, s.name, s.sku, s.requestId, stockName(model, s.sku)], model.search));
    const rows = records.map(s => {
      const cancelled = s.status === '已取消';
      const shipped = saleShippedQty(s);
      const collected = saleCollected(s);
      const invoiced = saleShippedAmount(s);
      const unshipped = numeric(s.qty) ? Math.max(0, s.qty - shipped) : 0;
      const outstanding = remaining(s.amount, collected);
      const ar = saleAR(s), advance = saleAdvance(s);
      const fulfillment = cancelled ? '已取消' : s.fulfillmentStatus || (shipped >= s.qty ? '已出库' : shipped > 0 ? '部分出库' : '待出库');
      const paymentStatus = cancelled ? '已取消' : outstanding > 0 ? collected > 0 ? '部分收款' : '未收款' : '已收款';
      const cost = shipped <= 0 ? '尚未结转' : s.costConfirmed === false || s.cogs === null ? '成本待确认' : amount(numeric(s.cogs) ? s.cogs : s.cost);
      return `<tr><td><strong>${esc(s.name)}</strong><small>${esc(s.id)}</small>${s.legacy ? `<small>${pill('历史出库记录', 'neutral')}</small>` : ''}</td><td class="trade-product-cell">${esc(stockName(model, s.sku))}<small>${esc(s.sku)}</small><small>${s.requestId ? '商城需求 '+esc(s.requestId) : '财务建单'}</small></td><td><strong>${number(shipped)} / ${number(s.qty)}</strong><small>已出库 / 订单数量</small>${!cancelled && unshipped > 0 ? `<small>尚预占 ${number(unshipped)}</small>` : ''}</td><td class="trade-number">${amount(invoiced)}<small>合同 ${amount(s.amount)}</small></td><td class="trade-number">${amount(collected)}<small>${advance > 0 ? '预收 '+amount(advance) : '应收 '+amount(ar)}</small>${outstanding > 0 ? `<small>合同未收 ${amount(outstanding)}</small>` : ''}</td><td class="trade-number">${cost}</td><td><div class="trade-status-stack">${pill(fulfillment, cancelled ? 'neutral' : shipped >= s.qty ? 'green' : 'amber')}${pill(paymentStatus, paymentStatus === '已收款' ? 'green' : cancelled ? 'neutral' : 'amber')}</div></td><td><div class="trade-row-actions">${!cancelled && unshipped > 0 ? button('出库交付', 'saleShip', s.id) : ''}${!cancelled && outstanding > 0 ? button(shipped > 0 ? '登记回款' : '登记预收', 'saleCollect', s.id) : ''}${!cancelled && shipped === 0 && collected === 0 ? button('取消订单', 'saleCancel', s.id) : ''}${button('单据追溯', 'detail', s.id, 'text-button', 'sale')}</div></td></tr>`;
    }).join('');
    return `<section class="suite-card trade-sales-card"><div class="trade-card-heading"><div><span class="trade-kicker">ORDER TO CASH</span><h2>销售订单、交付与回款</h2></div>${button('+ 新建销售单', 'saleNew', '', 'button primary')}</div><p class="trade-explanation">建单预占可售数量，出库才减少实物库存并结转成本。已交付产生应收；交付前收款单独列作预收。出库和收款进度分别跟踪。</p><div class="suite-table-scroll"><table class="suite-table trade-table"><thead><tr><th>客户 / 销售单</th><th>SKU / 来源</th><th>履约数量</th><th class="trade-number">已交付收入</th><th class="trade-number">累计收款 / 应收</th><th class="trade-number">已结转成本</th><th>履约 / 收款状态</th><th>操作</th></tr></thead><tbody>${rows || empty(8, '暂无匹配销售单。创建订单后可依次出库、收款，并追溯库存和资金变化。')}</tbody></table></div><div class="trade-table-foot"><span>${records.length} 笔销售记录</span><span>合同额与已交付收入分开显示</span></div></section>`;
  }

  function inventory(model) {
    const records = (model.db?.skus || []).filter(s => searchMatch([s.id, s.name, s.brand, s.model], model.search));
    const rows = records.map(s => {
      const free = available(model, s);
      const reserved = numeric(s.stock) && numeric(free) ? Math.max(0, s.stock - free) : null;
      const unknownCost = s.costConfirmed === false || !numeric(s.cost);
      const unknownValue = !numeric(s.inventoryValue);
      return `<tr><td class="trade-product-cell"><strong>${esc(s.name)}</strong><small>${esc(s.id)}</small>${s.unit ? `<small>计价单位：${esc(s.unit)}</small>` : ''}</td><td class="trade-number">${number(s.stock)}</td><td class="trade-number">${number(reserved)}</td><td class="trade-number"><strong class="${free === 0 ? 'trade-muted' : 'trade-green'}">${number(free)}</strong></td><td class="trade-number">${unknownCost ? pill('成本未确认', 'amber') : amount(s.cost)}</td><td class="trade-number">${unknownValue ? '未确认' : amount(s.inventoryValue)}</td><td><div class="trade-row-actions">${button('采购入库', 'purchaseNew', s.id)}${button('其他入库', 'adjustStock', s.id)}${button('出入库记录', 'detail', s.id, 'text-button', 'sku')}</div></td></tr>`;
    }).join('');
    return `<section class="suite-card trade-inventory-card"><div class="trade-card-heading"><div><span class="trade-kicker">INVENTORY CONTROL</span><h2>实物库存、预占与价值</h2></div>${button('登记其他入库', 'adjustStock', '', 'button')}</div><p class="trade-explanation">可售数量 = 实物库存 − 待出库订单预占。采购收货按入库金额更新库存账面价值；出库成本在交付时固化，不因后续采购价格变化而改写。</p><div class="suite-table-scroll"><table class="suite-table trade-table"><thead><tr><th>商品 / SKU</th><th class="trade-number">实物</th><th class="trade-number">预占</th><th class="trade-number">可售</th><th class="trade-number">单位账面成本</th><th class="trade-number">库存账面价值</th><th>操作</th></tr></thead><tbody>${rows || empty(7, '暂无匹配的 SKU。')}</tbody></table></div><div class="trade-table-foot"><span>${records.length} 项 SKU</span><span>其他入库需记录数量、成本及原因</span></div></section>${movements(model)}`;
  }

  function movementLabel(value) {
    return ({opening:'期初库存',opening_balance:'期初库存',purchase_receipt:'采购入库',purchaseReceive:'采购入库',purchase:'采购入库',sale_shipment:'销售出库',saleShip:'销售出库',shipment:'销售出库',adjustment:'其他入库',adjustStock:'其他入库',manual_in:'其他入库',revaluation:'成本调整',revalue:'成本调整',cost_adjustment:'成本调整'})[value] || value || '库存变动';
  }
  function signed(value, currency = false) {
    if (!numeric(value)) return '未确认';
    const prefix = value > 0 ? '+' : value < 0 ? '−' : '';
    return prefix + (currency ? amount(Math.abs(value)) : number(Math.abs(value)));
  }
  function movementTime(record) {
    if (record.timestamp) {
      const date = new Date(record.timestamp);
      if (Number.isFinite(date.getTime())) return date.toLocaleString('zh-CN', {month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
    }
    return record.day ? `10月${record.day}日` : '期初';
  }
  function movements(model) {
    const records = (model.db?.stockMovements || []).slice().reverse().filter(m => searchMatch([m.id, m.ref, m.sku, m.reason, m.kind, stockName(model,m.sku)], model.search));
    return `<section class="suite-card trade-movement-card"><div class="trade-card-heading"><div><span class="trade-kicker">STOCK MOVEMENTS</span><h2>出入库流水</h2></div><small>${records.length} 条</small></div><div class="suite-table-scroll"><table class="suite-table trade-table"><thead><tr><th>时间 / 流水</th><th>SKU / 商品</th><th>业务类型</th><th class="trade-number">数量变化</th><th class="trade-number">价值变化</th><th>来源单据 / 原因</th><th>操作</th></tr></thead><tbody>${records.slice(0,100).map(m => `<tr><td>${esc(movementTime(m))}<small>${esc(m.id)}</small></td><td class="trade-product-cell">${esc(stockName(model,m.sku))}<small>${esc(m.sku)}</small></td><td>${pill(movementLabel(m.kind), m.qtyDelta > 0 ? 'green' : m.qtyDelta < 0 ? 'amber' : 'neutral')}</td><td class="trade-number ${m.qtyDelta > 0 ? 'trade-green' : ''}">${signed(m.qtyDelta)}</td><td class="trade-number">${signed(m.valueDelta,true)}</td><td>${esc(m.ref || '期初建账')}<small>${esc(m.reason || '')}</small></td><td>${button('追溯', 'detail', m.id, 'text-button', 'movement')}</td></tr>`).join('') || empty(7,'出入库操作将在这里留下对应 SKU 与来源单号。')}</tbody></table></div>${records.length>100?'<p class="trade-explanation">展示最新100条，完整流水可导出。</p>':''}</section>`;
  }

  function cashLedger(model) {
    const records = (model.db?.transactions || []).map((t,index)=>({...t,viewIndex:index})).reverse().filter(t => searchMatch([t.id,t.ref,t.label,t.type],model.search));
    return `<section class="suite-card trade-cash-card"><div class="trade-card-heading"><div><span class="trade-kicker">CASH JOURNAL</span><h2>收付款与来源单据</h2></div><small>含报销、赞助等其他业务</small></div><p class="trade-explanation">只有登记收付款会改变现金。采购下单、收货、销售预占和出库均不直接改变现金。</p><div class="suite-table-scroll"><table class="suite-table trade-table"><thead><tr><th>账期日期</th><th>方向 / 用途</th><th class="trade-number">金额</th><th>业务来源</th><th>操作</th></tr></thead><tbody>${records.map(t=>`<tr><td>2026-10-${esc(String(t.day || 31).padStart(2,'0'))}</td><td>${pill(t.type==='in'?'收款':'付款',t.type==='in'?'green':'amber')}<small>${esc(t.label)}</small></td><td class="trade-number">${signed(t.type==='in'?t.amount:-t.amount,true)}</td><td>${esc(t.ref||'期初导入明细')}</td><td>${t.ref?button('关联单据','detail',t.id||t.ref,'text-button','cash'):'—'}</td></tr>`).join('')||empty(5,'暂无匹配资金流水。')}</tbody></table></div></section>`;
  }

  function pendingTasks(model) {
    const purchases=model.db?.suppliers||[],sales=model.db?.sales||[],s=model.summary||{};
    const pendingReceipts=purchases.filter(p=>p.sku&&!p.openingPayable&&numeric(p.qty)&&p.qty>(p.receivedQty||0)).length;
    const pendingShipments=sales.filter(s=>s.status!=='已取消'&&saleShippedQty(s)<s.qty).length;
    return `<section class="suite-card trade-next-card"><div class="trade-card-heading"><div><span class="trade-kicker">NEXT ACTIONS</span><h2>下一步业务处理</h2></div></div><div class="trade-next-grid">${[['purchases','待收货采购',number(pendingReceipts)+' 笔','收货后增加库存并确认应付'],['sales','待出库销售',number(pendingShipments)+' 笔','订单预占，出库后结转成本'],['purchases','采购待付',amount(s.ap),'登记付款后减少现金和应付'],['sales','销售待收',amount(s.ar),'登记回款后减少应收并增加现金']].map(([target,label,value,hint])=>`<button type="button" data-tradeop="tab" data-value="${target}"><span>${label}</span><strong>${value}</strong><small>${hint}</small><em>处理 →</em></button>`).join('')}</div></section>`;
  }

  function reconciliation(model) {
    const checks=model.checks;
    if(!checks)return '';
    const flags=[['quantityOK','库存数量','期初与出入库变化 = 当前实物库存'],['valueOK','库存价值','期初价值与价值变动 = 当前账面价值'],['purchasePaymentOK','采购付款','累计付款 = 对应采购单付款流水'],['saleCollectionOK','销售收款','累计收款 = 对应销售单收款流水']];
    return `<section class="suite-card trade-check-card"><div class="trade-card-heading"><div><span class="trade-kicker">RECONCILIATION</span><h2>数量、价值与收付款核对</h2></div>${pill(checks.ok?'记录一致':'存在待核对项',checks.ok?'green':'amber')}</div><div class="trade-check-grid">${flags.map(([key,label,formula])=>`<div><span>${label}</span>${pill(checks[key]===true?'一致':checks[key]===false?'待核对':'未核对',checks[key]===true?'green':'amber')}<small>${formula}</small></div>`).join('')}</div>${checks.unknownValueSkus?.length?`<p class="trade-explanation">${checks.unknownValueSkus.length} 项 SKU 成本未确认；未知价值单独保留，不按零成本参与毛利。</p>`:''}${checks.errors?.length?`<div class="trade-check-errors">${checks.errors.map(error=>`<p>${esc(error.message||error.code)}${error.documentId?' · '+esc(error.documentId):''}${error.sku?' · '+esc(error.sku):''}</p>`).join('')}</div>`:''}</section>`;
  }

  function overview(model) {
    const s=model.summary||{};
    const amountMetric=(value)=>numeric(value)?amount(value):'未确认';
    const performance=metricCards([
      ['已交付销售收入',amountMetric(s.revenue),'按已出库交付金额统计'],
      ['已结转销售成本',amountMetric(s.cogs),'由出库时的库存成本固化'],
      ['交付毛利',amountMetric(s.grossProfit),'收入减销售成本；成本缺失时待确认'],
      ['客户预收款',amountMetric(s.advances),'已收款但尚未交付部分']
    ],'trade-performance');
    return `${performance}${pendingTasks(model)}${reconciliation(model)}<div class="trade-overview-grid"><section class="suite-card"><div class="trade-card-heading"><h2>数量与金额各自流转</h2></div><div class="trade-rule-row"><span>采购收货</span><strong>库存 ↑　应付 ↑</strong><small>按采购单价和实际收货数量记录</small></div><div class="trade-rule-row"><span>供应商付款</span><strong>现金 ↓　应付 ↓</strong><small>付款关联同一采购单，分次结款可追溯</small></div><div class="trade-rule-row"><span>销售交付</span><strong>库存 ↓　应收 / 收入 ↑</strong><small>按出库数量结转销售成本</small></div><div class="trade-rule-row"><span>客户回款</span><strong>现金 ↑　应收 ↓</strong><small>交付前收到的款项单列为预收</small></div></section><section class="suite-card"><div class="trade-card-heading"><h2>同一份业务记录</h2></div><p class="trade-explanation">采购单是收货入库和供应商付款的来源；销售单是库存预占、出库和客户收款的来源。库存与资金流水都保留关联单号。</p><div class="trade-trace-demo"><span>采购单 PO</span><b>→</b><span>入库流水</span><b>→</b><span>库存价值</span><b>→</b><span>销售单 SO</span><b>→</b><span>出库与收款</span></div><p class="trade-explanation">旧版没有 SKU 的供应商余额作为期初应付保留；旧销售已减过的库存按历史出库迁移，避免再次扣减。</p></section></div>${movements(model)}`;
  }

  function render(model = {}) {
    const current=model.tab||'overview';
    let body;
    if(current==='purchases')body=procurement(model);
    else if(current==='inventory')body=inventory(model);
    else if(current==='sales')body=renderSales(model);
    else if(current==='ledger')body=cashLedger(model)+movements(model);
    else body=overview(model);
    return `<div class="trade-workspace">${topMetrics(model)}${workflow()}${toolbar(model)}${body}<p class="trade-footnote">本页为本地业务台账。收货与交付用于库存、应收应付和成本管理；收付款另行登记。历史已结账报表保持其原快照口径。</p></div>`;
  }
  window.AuroraTradeView=Object.freeze({render,renderSales});
})();
