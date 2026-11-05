/* Local trade ledger: source documents, physical inventory and cash stay linked. */
(function (root, factory) {
 'use strict';
 const api = factory();
 if (typeof module === 'object' && module.exports) module.exports = api;
 if (root) root.AuroraTrade = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
 'use strict';
 const VERSION = 1, MAX = 10000000000, MAX_QTY = 10000000;
 const clone = value => structuredClone(value);
 const stamp = () => new Date().toISOString();
 const uid = prefix => prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
 const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
 const fail = message => { throw new Error(message); };
 const round = number => Math.round((number + Number.EPSILON) * 100) / 100;
 const unit = number => Math.round((number + Number.EPSILON) * 1000000) / 1000000;
 function number(value, label) {
  if ((typeof value !== 'number' && typeof value !== 'string') || value === '' || (typeof value === 'string' && !value.trim())) fail(label + '须为有效数值');
  const result = Number(value);
  if (!Number.isFinite(result)) fail(label + '须为有效数值');
  return result;
 }
 function amount(value, label = '金额', allowZero = false) {
  const n = number(value, label);
  if (n < 0 || (!allowZero && n <= 0) || n > MAX) fail(label + (allowZero ? '须为非负金额' : '须大于零'));
  const result = round(n);
  if (!allowZero && result <= 0) fail(label + '至少为0.01元');
  return result;
 }
 function quantity(value, allowZero = false) {
  const n = number(value, '数量');
  if (!Number.isInteger(n) || n < 0 || n > MAX_QTY || (!allowZero && !n)) fail('数量须为' + (allowZero ? '非负' : '正') + '整数');
  return n;
 }
 function rate(value, label = '单位成本', allowZero = true) {
  const n = number(value, label);
  if (n < 0 || n > 1000000000 || (!allowZero && n <= 0)) fail(label + '无效');
  const result = unit(n);
  if (!allowZero && result <= 0) fail(label + '须大于零');
  return result;
 }
 function text(value, label, max = 120) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) fail('请填写有效的' + label);
  return value.trim();
 }
 function sum(values) { return round(values.reduce((n, v) => n + v, 0)); }
 function getSku(db, id) { return db.skus.find(s => s.id === id) || fail('找不到对应SKU'); }
 function getPurchase(db, id) { return db.suppliers.find(p => p.id === id) || fail('找不到采购单'); }
 function getSale(db, id) { return db.sales.find(s => s.id === id) || fail('找不到销售单'); }
 function baseShape(db) {
  if (!db || typeof db !== 'object') fail('工作区数据无效');
  for (const key of ['skus', 'suppliers', 'sales', 'transactions']) if (!Array.isArray(db[key])) fail('工作区缺少' + key);
  for (const key of ['skus', 'suppliers', 'sales']) {
   const ids = new Set();
   for (const row of db[key]) { if (!row || typeof row.id !== 'string' || !row.id || ids.has(row.id)) fail(key + '存在无效或重复单号'); ids.add(row.id); }
  }
 }
 function movement(db, {sku, qtyDelta, valueDelta, kind, ref, reason, operationId, qtyBefore, valueBefore, unitCost}) {
  const entry = {id: uid('MV'), sku: sku.id, qtyDelta, valueDelta, qtyBefore, qtyAfter: sku.stock,
   valueBefore, valueAfter: sku.inventoryValue, unitCost: unitCost ?? null, kind, ref,
   reason: reason || '', day: 31, date: '2026-10-31', timestamp: stamp(), operationId};
  db.stockMovements.push(entry);
  return entry;
 }
 function flow(db, type, value, label, documentId, sourceType, operationId) {
  const entry = {id: uid('TX'), day: 31, date: '2026-10-31', type, amount: value, label,
   ref: documentId, tradeDocumentId: documentId, sourceType, operationId, timestamp: stamp()};
  db.transactions.push(entry);
  return entry;
 }
 function refreshSale(sale) {
  sale.status = sale.status === '已取消' ? '已取消' : sale.collected >= sale.amount ? '已收款' : '待收款';
  sale.fulfillmentStatus = sale.status === '已取消' ? '已取消' : sale.shippedQty === sale.qty ? '已出库' : sale.shippedQty > 0 ? '部分出库' : '待出库';
  if (!(sale.legacy && sale.status === '已取消')) sale.cost = sale.cogs === null ? sale.cost || 0 : sale.cogs;
 }
 function openSku(db, sku) {
  sku.stock = quantity(sku.stock, true);
  sku.cost = rate(sku.cost ?? 0);
  sku.costConfirmed = sku.costConfirmed !== false;
  sku.inventoryValue = sku.stock === 0 ? 0 : sku.costConfirmed ? amount(sku.stock * sku.cost, '期初库存价值', true) : null;
  movement(db, {sku, qtyDelta: sku.stock, valueDelta: sku.inventoryValue, kind: 'opening', ref: 'OPENING:' + sku.id,
   reason: '既有库存迁移期初，不重复生成采购或现金', operationId: 'opening:' + sku.id,
   qtyBefore: 0, valueBefore: 0, unitCost: sku.costConfirmed ? sku.cost : null});
 }
 function transactionIds(db) {
  const ids = new Set(db.transactions.filter(t => typeof t?.id === 'string' && t.id).map(t => t.id));
  db.transactions.forEach((tx, index) => {
   if (tx.id === undefined) {
    const base = 'LEGACY-TX-' + String(index + 1).padStart(6, '0');
    let id = base, suffix = 1;
    while (ids.has(id)) id = base + '-' + suffix++;
    tx.id = id; ids.add(id);
   }
  });
 }
 function migrateInternal(db) {
  baseShape(db);
  transactionIds(db);
  if (db.tradeVersion === VERSION) {
   if (!Array.isArray(db.stockMovements)) fail('库存流水缺失');
   for (const sku of db.skus) if (!own(sku, 'inventoryValue')) {
    if (db.stockMovements.some(m => m.sku === sku.id)) fail('已迁移SKU缺少库存价值，不能覆盖历史');
    openSku(db, sku);
   }
   return;
  }
  if (db.tradeVersion !== undefined) fail('交易数据版本不支持');
  if (db.stockMovements?.length) fail('存在未识别库存流水，无法自动建立期初');
  db.stockMovements = [];
  db.tradeOperations = {};
  db.tradeOpeningCash = db.tradeOpeningCash === undefined ? 90000 : amount(db.tradeOpeningCash, '期初现金', true);
  for (const sku of db.skus) openSku(db, sku);
  for (const purchase of db.suppliers) {
   purchase.amount = amount(purchase.amount, '期初采购金额');
   purchase.paid = amount(purchase.paid ?? 0, '期初已付', true);
   if (purchase.paid > purchase.amount) fail('期初采购已付超过金额');
   purchase.tradeVersion = VERSION;
   purchase.openingPayable = true;
   purchase.receivedAmount = purchase.amount;
   purchase.receivedQty = 0;
   purchase.openingPaid = purchase.paid;
   purchase.received = !!purchase.received;
  }
  for (const sale of db.sales) {
   sale.qty = quantity(sale.qty);
   sale.amount = amount(sale.amount, '期初销售金额');
   sale.cost = amount(sale.cost ?? 0, '期初销售成本', true);
   const sku = getSku(db, sale.sku);
   if (!['待收款', '已收款', '已取消'].includes(sale.status)) fail('期初销售状态无效');
   sale.tradeVersion = VERSION;
   sale.legacy = true;
   sale.unitPrice = unit(sale.amount / sale.qty);
   sale.collected = sale.status === '已收款' ? sale.amount : 0;
   sale.openingCollected = sale.collected;
   sale.shippedQty = sale.status === '已取消' ? 0 : sale.qty;
   sale.shippedAmount = sale.status === '已取消' ? 0 : sale.amount;
   sale.costConfirmed = sale.costConfirmed === undefined ? sku.costConfirmed !== false : sale.costConfirmed === true;
   sale.cogs = sale.status === '已取消' ? 0 : sale.costConfirmed ? sale.cost : null;
   refreshSale(sale);
  }
  db.tradeVersion = VERSION;
 }
 function replace(db, next) { for (const key of Object.keys(db)) delete db[key]; Object.assign(db, next); }
 function migrate(db) {
  const next = clone(db); migrateInternal(next); validateInternal(next); replace(db, next); return db;
 }
 function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  return JSON.stringify(value);
 }
 function write(db, kind, payload, operationId, action) {
  const next = clone(db); migrateInternal(next); validateInternal(next);
  const id = operationId === undefined ? uid('OP') : text(operationId, '操作编号', 180);
  if (!/^[a-zA-Z0-9_.:-]+$/.test(id) || id === '__proto__' || id === 'constructor' || id === 'prototype') fail('操作编号格式无效');
  const signature = canonical({kind, payload});
  if (own(next.tradeOperations, id)) {
   const previous = next.tradeOperations[id];
   if (previous.signature !== signature) fail('该操作编号已用于其他内容，请刷新后重试');
   return clone(previous.result);
  }
  const result = action(next, id);
  next.tradeOperations[id] = {kind, signature, timestamp: stamp(), result: clone(result)};
  validateInternal(next);
  replace(db, next);
  return clone(result);
 }
 function reserved(db, skuId) {
  return db.sales.filter(s => s.sku === skuId && s.status !== '已取消').reduce((n, s) => n + s.qty - s.shippedQty, 0);
 }
 function available(db, skuId) { if (db.tradeVersion !== VERSION) migrate(db); return getSku(db, skuId).stock - reserved(db, skuId); }
 function updateSkuValue(sku, nextValue) {
  sku.inventoryValue = nextValue;
  if (nextValue !== null) {
   sku.costConfirmed = true;
   if (sku.stock) sku.cost = unit(nextValue / sku.stock);
  } else sku.costConfirmed = false;
 }
 function createPurchase(db, input) {
  const p = {name: text(input.name, '供应商'), sku: text(input.sku, 'SKU'), qty: quantity(input.qty), unitCost: rate(input.unitCost), date: text(input.date, '计划付款日期')};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date) || Number.isNaN(Date.parse(p.date)) || new Date(p.date + 'T00:00:00Z').toISOString().slice(0, 10) !== p.date) fail('计划付款日期无效');
  const value = amount(p.qty * p.unitCost, '采购总额', true);
  return write(db, 'createPurchase', p, input.operationId, next => {
   const sku = getSku(next, p.sku);
   const purchase = {id: uid('PO'), ...p, item: sku.name, amount: value, paid: 0, openingPaid: 0,
    received: false, receivedQty: 0, receivedAmount: 0, openingPayable: false, tradeVersion: VERSION, createdAt: stamp()};
   next.suppliers.unshift(purchase); return purchase;
  });
 }
 function receivePurchase(db, id, qty, operationId) {
  qty = quantity(qty);
  return write(db, 'receivePurchase', {id, qty}, operationId, (next, op) => {
   const p = getPurchase(next, id);
   if (p.openingPayable) fail('期初应付没有关联SKU，请另建采购单后入库');
   if (qty > p.qty - p.receivedQty) fail('收货数量超过未收货数量');
   const sku = getSku(next, p.sku), beforeQty = sku.stock, beforeValue = sku.inventoryValue;
   const newQty = p.receivedQty + qty;
   const cumulative = amount(newQty * p.unitCost, '收货计价金额', true), value = round(cumulative - p.receivedAmount);
   sku.stock += qty;
   updateSkuValue(sku, beforeValue === null ? null : round(beforeValue + value));
   p.receivedQty = newQty; p.receivedAmount = cumulative; p.received = p.receivedQty === p.qty;
   movement(next, {sku, qtyDelta: qty, valueDelta: value, kind: 'purchase_receipt', ref: p.id, reason: '采购收货入库',
    operationId: op, qtyBefore: beforeQty, valueBefore: beforeValue, unitCost: p.unitCost});
   return p;
  });
 }
 function payPurchase(db, id, value, operationId) {
  value = amount(value, '本次付款');
  return write(db, 'payPurchase', {id, amount: value}, operationId, (next, op) => {
   const p = getPurchase(next, id), remaining = round(p.receivedAmount - p.paid);
   if (value > remaining) fail('付款超过已收货应付余额；未收货采购不生成应付');
   p.paid = round(p.paid + value);
   flow(next, 'out', value, '供应商结款：' + p.name, id, 'purchase_payment', op); return p;
  });
 }
 function createSale(db, input) {
  const p = {name: text(input.name, '客户名称'), sku: text(input.sku, 'SKU'), qty: quantity(input.qty)};
  if (input.unitPrice !== undefined) p.unitPrice = rate(input.unitPrice, '销售单价', false);
  if (input.requestId !== undefined) p.requestId = text(input.requestId, '来源需求编号');
  return write(db, 'createSale', p, input.operationId, next => {
   const sku = getSku(next, p.sku);
   if (p.qty > sku.stock - reserved(next, sku.id)) fail('可用库存不足（已扣除其他销售单预占）');
   const unitPrice = p.unitPrice ?? rate(sku.price, '销售单价', false);
   const value = amount(unitPrice * p.qty, '销售金额');
   const sale = {id: uid('SO'), ...p, unitPrice, amount: value, cost: 0, costConfirmed: false, cogs: 0,
    shippedQty: 0, shippedAmount: 0, collected: 0, openingCollected: 0, legacy: false,
    status: '待收款', fulfillmentStatus: '待出库', tradeVersion: VERSION, createdAt: stamp()};
   next.sales.unshift(sale); return sale;
  });
 }
 function shipSale(db, id, qty, operationId) {
  qty = quantity(qty);
  return write(db, 'shipSale', {id, qty}, operationId, (next, op) => {
   const sale = getSale(next, id);
   if (sale.status === '已取消') fail('已取消销售单不能出库');
   if (qty > sale.qty - sale.shippedQty) fail('出库数量超过未发货数量');
   const sku = getSku(next, sale.sku);
   if (qty > sku.stock) fail('实物库存不足');
   if (sku.inventoryValue === null || !sku.costConfirmed) fail('库存成本尚未确认，请先通过采购入库或库存成本调整登记');
   const beforeQty = sku.stock, beforeValue = sku.inventoryValue;
   const value = qty === sku.stock ? beforeValue : round(beforeValue * qty / sku.stock);
   sku.stock -= qty; updateSkuValue(sku, round(beforeValue - value));
   sale.shippedQty += qty;
   sale.shippedAmount = round(sale.amount * sale.shippedQty / sale.qty);
   sale.cogs = round(sale.cogs + value); sale.costConfirmed = true; refreshSale(sale);
   movement(next, {sku, qtyDelta: -qty, valueDelta: -value, kind: 'sale_shipment', ref: id, reason: '销售出库并结转成本',
    operationId: op, qtyBefore: beforeQty, valueBefore: beforeValue, unitCost: unit(beforeValue / beforeQty)});
   return sale;
  });
 }
 function collectSale(db, id, value, operationId) {
  value = amount(value, '本次收款');
  return write(db, 'collectSale', {id, amount: value}, operationId, (next, op) => {
   const sale = getSale(next, id);
   if (sale.status === '已取消') fail('已取消销售单不能收款');
   if (value > round(sale.amount - sale.collected)) fail('收款超过订单剩余未收金额');
   sale.collected = round(sale.collected + value); refreshSale(sale);
   flow(next, 'in', value, '销售收款：' + sale.name, id, 'sale_collection', op); return sale;
  });
 }
 function cancelSale(db, id) {
  return write(db, 'cancelSale', {id}, undefined, next => {
   const sale = getSale(next, id);
   if (sale.status === '已取消') return sale;
   if (sale.shippedQty || sale.collected) fail('已有出库或收款，请先处理退货退款，不能直接取消');
   sale.status = '已取消'; refreshSale(sale); return sale;
  });
 }
 function adjustStock(db, input, operationId) {
  const p = {sku: text(input.sku, 'SKU'), qty: quantity(input.qty), unitCost: rate(input.unitCost), reason: text(input.reason, '入库原因', 240)};
  return write(db, 'adjustStock', p, operationId ?? input.operationId, (next, op) => {
   const sku = getSku(next, p.sku), beforeQty = sku.stock, beforeValue = sku.inventoryValue;
   const value = amount(p.qty * p.unitCost, '入库成本', true);
   sku.stock += p.qty; updateSkuValue(sku, beforeValue === null ? null : round(beforeValue + value));
   return movement(next, {sku, qtyDelta: p.qty, valueDelta: value, kind: 'adjustment', ref: uid('ADJ'), reason: p.reason,
    operationId: op, qtyBefore: beforeQty, valueBefore: beforeValue, unitCost: p.unitCost});
  });
 }
 function revalueStock(db, input, operationId) {
  const p = {sku: text(input.sku, 'SKU'), unitCost: rate(input.unitCost), reason: text(input.reason, '成本调整原因', 240)};
  return write(db, 'revalueStock', p, operationId ?? input.operationId, (next, op) => {
   const sku = getSku(next, p.sku), beforeQty = sku.stock, beforeValue = sku.inventoryValue;
   const nextValue = amount(sku.stock * p.unitCost, '调整后库存价值', true);
   sku.inventoryValue = nextValue; sku.cost = p.unitCost; sku.costConfirmed = true;
   return movement(next, {sku, qtyDelta: 0, valueDelta: beforeValue === null ? null : round(nextValue - beforeValue), kind: 'revalue',
    ref: uid('VAL'), reason: p.reason, operationId: op, qtyBefore: beforeQty, valueBefore: beforeValue, unitCost: p.unitCost});
  });
 }
 function balanceChecksInternal(db) {
  const errors = [], unknownValueSkus = [], ledgers = new Map();
  const add = (code, message, details = {}) => errors.push({code, message, ...details});
  const equivalent = (a, b) => a === null || b === null ? a === b : Math.abs(a - b) < 0.000001;
  const ids = new Set();
  for (const m of db.stockMovements) {
   if (!m || typeof m.id !== 'string' || ids.has(m.id)) { add('movement_id', '库存流水编号无效或重复'); continue; }
   ids.add(m.id);
   const sku = db.skus.find(s => s.id === m.sku);
   if (!sku) { add('movement_sku', '库存流水引用不存在的SKU', {sku: m.sku}); continue; }
   const previous = ledgers.get(m.sku) || {qty: 0, value: 0};
   if (m.qtyBefore !== previous.qty || m.qtyAfter !== m.qtyBefore + m.qtyDelta || !Number.isInteger(m.qtyDelta) || m.qtyAfter < 0) add('quantity_chain', '库存数量流水不连续', {sku: m.sku});
   if (!equivalent(m.valueBefore, previous.value)) add('value_chain', '库存价值流水不连续', {sku: m.sku});
   let expected;
   if (m.kind === 'opening') expected = m.valueDelta;
   else if (m.kind === 'revalue') {
    expected = round(m.qtyAfter * m.unitCost);
    if (!equivalent(m.valueDelta, previous.value === null ? null : round(expected - previous.value))) add('revalue_delta', '库存成本调整差额不符', {sku: m.sku});
   } else expected = previous.value === null || m.valueDelta === null ? null : round(previous.value + m.valueDelta);
   if (!equivalent(expected, m.valueAfter)) add('value_delta', '库存价值变动计算不符', {sku: m.sku});
   if (!['opening', 'purchase_receipt', 'sale_shipment', 'adjustment', 'revalue'].includes(m.kind)) add('movement_kind', '库存流水类型无效', {sku: m.sku});
   if (m.kind === 'opening' && ledgers.has(m.sku)) add('opening_duplicate', 'SKU存在重复期初', {sku: m.sku});
   if (m.kind === 'purchase_receipt' && !db.suppliers.some(p => p.id === m.ref && p.sku === m.sku && !p.openingPayable)) add('purchase_ref', '收货流水缺少关联采购单', {sku: m.sku});
   if (m.kind === 'sale_shipment' && !db.sales.some(s => s.id === m.ref && s.sku === m.sku && !s.legacy)) add('sale_ref', '出库流水缺少关联销售单', {sku: m.sku});
   ledgers.set(m.sku, {qty: m.qtyAfter, value: m.valueAfter});
  }
  for (const sku of db.skus) {
   const ledger = ledgers.get(sku.id);
   if (!ledger || ledger.qty !== sku.stock) add('quantity_balance', '库存流水与实物余额不一致', {sku: sku.id});
   if (!ledger || !equivalent(ledger.value, sku.inventoryValue)) add('value_balance', '库存流水与价值余额不一致', {sku: sku.id});
   if (sku.inventoryValue === null && sku.stock > 0) unknownValueSkus.push(sku.id);
   if (sku.stock - reserved(db, sku.id) < 0) add('reservation_balance', '销售预占超过实物库存', {sku: sku.id});
  }
  for (const p of db.suppliers) {
   const paid = sum(db.transactions.filter(t => t.sourceType === 'purchase_payment' && t.tradeDocumentId === p.id).map(t => t.amount));
   if (round(p.openingPaid + paid) !== p.paid) add('purchase_payment', '采购已付与资金流水不一致', {documentId: p.id});
   if (!p.openingPayable) {
    const moves = db.stockMovements.filter(m => m.kind === 'purchase_receipt' && m.ref === p.id);
    if (moves.reduce((n, m) => n + m.qtyDelta, 0) !== p.receivedQty || sum(moves.map(m => m.valueDelta)) !== p.receivedAmount) add('purchase_receipt', '采购收货与库存流水不一致', {documentId: p.id});
   }
  }
  for (const sale of db.sales) {
   const collected = sum(db.transactions.filter(t => t.sourceType === 'sale_collection' && t.tradeDocumentId === sale.id).map(t => t.amount));
   if (round(sale.openingCollected + collected) !== sale.collected) add('sale_collection', '销售收款与资金流水不一致', {documentId: sale.id});
   if (!sale.legacy) {
    const moves = db.stockMovements.filter(m => m.kind === 'sale_shipment' && m.ref === sale.id);
    if (-moves.reduce((n, m) => n + m.qtyDelta, 0) !== sale.shippedQty || -sum(moves.map(m => m.valueDelta)) !== sale.cogs) add('sale_shipment', '销售出库成本与库存流水不一致', {documentId: sale.id});
   }
  }
  for (const tx of db.transactions) {
   if (tx.sourceType === 'purchase_payment' && (tx.type !== 'out' || !db.suppliers.some(p => p.id === tx.tradeDocumentId))) add('payment_ref', '采购付款流水来源不正确');
   if (tx.sourceType === 'sale_collection' && (tx.type !== 'in' || !db.sales.some(s => s.id === tx.tradeDocumentId))) add('collection_ref', '销售收款流水来源不正确');
  }
  const has = codes => errors.some(e => codes.includes(e.code));
  return {ok: errors.length === 0, quantityOK: !has(['quantity_chain', 'quantity_balance', 'reservation_balance']),
   valueOK: !has(['value_chain', 'value_delta', 'value_balance', 'revalue_delta']),
   purchasePaymentOK: !has(['purchase_payment', 'payment_ref']), saleCollectionOK: !has(['sale_collection', 'collection_ref']), errors, unknownValueSkus};
 }
 function validateInternal(db) {
  baseShape(db);
  if (db.tradeVersion !== VERSION || !Array.isArray(db.stockMovements) || !db.tradeOperations || typeof db.tradeOperations !== 'object' || Array.isArray(db.tradeOperations)) fail('交易流水结构无效');
  const numericFields = (record, fields) => {
   for (const field of fields) if (typeof record[field] !== 'number' || !Number.isFinite(record[field])) fail(field + '必须保存为数值');
  };
  numericFields(db, ['tradeOpeningCash']);
  amount(db.tradeOpeningCash, '期初现金', true);
  for (const sku of db.skus) {
   numericFields(sku, ['stock', 'cost']);
   if (sku.inventoryValue !== null) numericFields(sku, ['inventoryValue']);
   quantity(sku.stock, true); rate(sku.cost ?? 0);
   if (sku.inventoryValue !== null) amount(sku.inventoryValue, '库存价值', true);
   if (typeof sku.costConfirmed !== 'boolean' || (sku.inventoryValue === null && sku.costConfirmed) || (sku.inventoryValue !== null && sku.stock > 0 && !sku.costConfirmed)) fail('库存成本状态不一致');
   if (sku.stock === 0 && sku.inventoryValue !== 0) fail('零库存的账面价值须为零');
  }
  for (const p of db.suppliers) {
   numericFields(p, ['amount', 'paid', 'openingPaid', 'receivedAmount']);
   amount(p.amount, '采购金额', true); amount(p.paid, '采购已付', true); amount(p.openingPaid, '采购期初已付', true); amount(p.receivedAmount, '收货金额', true);
   if (p.tradeVersion !== VERSION || typeof p.openingPayable !== 'boolean' || typeof p.received !== 'boolean' || p.paid > p.receivedAmount || p.receivedAmount > p.amount || p.openingPaid > p.paid) fail('采购收货或付款金额不符');
   if (!p.openingPayable) {
    numericFields(p, ['qty', 'receivedQty', 'unitCost']);
    getSku(db, p.sku); quantity(p.qty); quantity(p.receivedQty, true); rate(p.unitCost);
    if (p.receivedQty > p.qty || p.amount !== round(p.qty * p.unitCost) || p.receivedAmount !== round(p.receivedQty * p.unitCost) || p.received !== (p.receivedQty === p.qty) || p.openingPaid !== 0) fail('采购数量与计价不符');
   }
  }
  for (const sale of db.sales) {
   numericFields(sale, ['qty', 'amount', 'shippedQty', 'shippedAmount', 'collected', 'openingCollected', 'cost']);
   if (sale.cogs !== null) numericFields(sale, ['cogs']);
   getSku(db, sale.sku); quantity(sale.qty); quantity(sale.shippedQty, true); amount(sale.amount, '销售金额'); amount(sale.shippedAmount, '销售出库金额', true); amount(sale.collected, '销售收款', true); amount(sale.openingCollected, '期初销售收款', true); amount(sale.cost, '销售成本', true);
   if (sale.cogs !== null) amount(sale.cogs, '已结转销售成本', true);
   if (sale.tradeVersion !== VERSION || typeof sale.legacy !== 'boolean' || typeof sale.costConfirmed !== 'boolean' || !['待收款', '已收款', '已取消'].includes(sale.status) || sale.shippedQty > sale.qty || sale.collected > sale.amount || sale.openingCollected > sale.collected || sale.shippedAmount !== round(sale.amount * sale.shippedQty / sale.qty)) fail('销售金额或履约数据不符');
   if (sale.status === '已取消' && (sale.shippedQty || sale.collected)) fail('已取消单据存在发货或收款');
   if (sale.status !== '已取消' && (sale.status === '已收款') !== (sale.collected === sale.amount)) fail('销售收款状态不符');
   if (sale.fulfillmentStatus !== (sale.status === '已取消' ? '已取消' : sale.shippedQty === sale.qty ? '已出库' : sale.shippedQty > 0 ? '部分出库' : '待出库')) fail('销售履约状态不符');
   if (sale.cogs === null && sale.costConfirmed) fail('未知销售成本不能确认毛利');
  }
  for (const m of db.stockMovements) {
   text(m.id, '库存流水编号', 200); text(m.sku, 'SKU'); text(m.ref, '来源单号', 240); text(m.operationId, '操作编号', 240);
   if (!Number.isInteger(m.qtyDelta) || !Number.isInteger(m.qtyBefore) || !Number.isInteger(m.qtyAfter) || m.qtyBefore < 0 || m.qtyAfter < 0) fail('库存流水数量无效');
   for (const k of ['valueBefore', 'valueAfter']) if (m[k] !== null) amount(m[k], '库存流水价值', true);
   if (m.valueDelta !== null && (!Number.isFinite(m.valueDelta) || Math.abs(m.valueDelta) > MAX)) fail('库存价值变动无效');
   if (m.kind === 'revalue') rate(m.unitCost);
  }
  const transactionSet = new Set();
  for (const t of db.transactions) {
   numericFields(t, ['amount']);
   if (!['in', 'out'].includes(t.type)) fail('资金方向无效'); amount(t.amount, '资金流水金额');
   text(t.id, '资金流水编号', 200); if (transactionSet.has(t.id)) fail('资金流水编号重复'); transactionSet.add(t.id);
  }
  for (const [id, op] of Object.entries(db.tradeOperations)) {
   if (!/^[a-zA-Z0-9_.:-]+$/.test(id) || !op || typeof op.kind !== 'string' || typeof op.signature !== 'string' || typeof op.timestamp !== 'string' || !op.result || typeof op.result !== 'object') fail('幂等操作记录格式无效');
  }
  const checks = balanceChecksInternal(db);
  if (!checks.ok) fail(checks.errors[0].message);
  return checks;
 }
 function validate(db) { const next = clone(db); migrateInternal(next); return {valid: true, checks: validateInternal(next)}; }
 function balanceChecks(db) {
  try { const next = clone(db); migrateInternal(next); return balanceChecksInternal(next); }
  catch (error) { return {ok: false, quantityOK: false, valueOK: false, purchasePaymentOK: false, saleCollectionOK: false, errors: [{code: 'invalid_data', message: error.message}], unknownValueSkus: []}; }
 }
 function summary(db) {
  if (db.tradeVersion !== VERSION) migrate(db);
  const unknownInventory = db.skus.filter(s => s.stock > 0 && s.inventoryValue === null);
  const unknownSales = db.sales.filter(s => s.status !== '已取消' && s.shippedQty > 0 && s.cogs === null);
  const revenue = sum(db.sales.filter(s => s.status !== '已取消').map(s => s.shippedAmount));
  const knownCogs = sum(db.sales.filter(s => s.status !== '已取消' && s.cogs !== null).map(s => s.cogs));
  const knownInventoryValue = sum(db.skus.filter(s => s.inventoryValue !== null).map(s => s.inventoryValue));
  const ar = sum(db.sales.filter(s => s.status !== '已取消').map(s => Math.max(0, round(s.shippedAmount - s.collected))));
  const advances = sum(db.sales.filter(s => s.status !== '已取消').map(s => Math.max(0, round(s.collected - s.shippedAmount))));
  return {inventoryValue: unknownInventory.length ? null : knownInventoryValue, knownInventoryValue, inventoryUnknownCount: unknownInventory.length,
   ap: sum(db.suppliers.map(p => round(p.receivedAmount - p.paid))), ar, advances,
   revenue, cogs: unknownSales.length ? null : knownCogs, knownCogs, grossProfit: unknownSales.length ? null : round(revenue - knownCogs),
   unknownCostCount: unknownSales.length, unknownCostSalesCount: unknownSales.length,
   cash: round(db.tradeOpeningCash + sum(db.transactions.map(t => t.type === 'in' ? t.amount : -t.amount))),
   commitment: sum(db.suppliers.filter(p => !p.openingPayable).map(p => round(p.amount - p.receivedAmount))),
   reservedQty: db.sales.filter(s => s.status !== '已取消').reduce((n, s) => n + s.qty - s.shippedQty, 0),
   legacySaleCount: db.sales.filter(s => s.legacy).length,
   purchaseUnpaid: sum(db.suppliers.map(p => round(p.amount - p.paid))),
   salesUncollected: sum(db.sales.filter(s => s.status !== '已取消').map(s => round(s.amount - s.collected)))};
 }
 return Object.freeze({version: VERSION, migrate, validate, available, createPurchase, receivePurchase, payPurchase,
  createSale, shipSale, collectSale, cancelSale, adjustStock, revalueStock, summary, balanceChecks});
});
