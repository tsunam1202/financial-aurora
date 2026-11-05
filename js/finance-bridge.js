/* Local demonstration transport. Only public inventory and quote requests cross this bridge. */
(() => {
 'use strict';
 const isFile=location.protocol==='file:';
 const KEY='aurora-commerce-link-v1', CHANNEL='aurora-commerce-v1';
 const read=()=>{const raw=localStorage.getItem(KEY);if(!raw)return {version:1,inventory:[],requests:[]};const data=JSON.parse(raw);if(data.version!==1||!Array.isArray(data.inventory)||!Array.isArray(data.requests))throw Error('联动数据格式异常，请恢复备份');return data};
 const save=data=>localStorage.setItem(KEY,JSON.stringify(data));
 const text=(s,max=120)=>typeof s==='string'&&s.trim().length>0&&s.length<=max;
 const catalog=id=>window.AuroraCatalog.get(id);
 window.addEventListener('message',event=>{
  if(event.source!==parent||event.data?.channel!==CHANNEL||(isFile?!['null','file://'].includes(event.origin):event.origin!==location.origin))return;
  const {id,nonce,operation,payload}=event.data;
  if(typeof id!=='string'||typeof nonce!=='string')return;
  try{
   const data=read();
   if(operation==='request'){
    if(!payload||!text(payload.id)||!text(payload.customer)||!Array.isArray(payload.lines)||!payload.lines.length||payload.lines.length>60)throw Error('需求单内容无效');
    const ids=new Set();for(const line of payload.lines){if(!catalog(line.sku)||!Number.isInteger(line.qty)||line.qty<1||line.qty>20||ids.has(line.sku))throw Error('商品或数量无效');ids.add(line.sku)}
    if(!data.requests.some(r=>r.id===payload.id)){
     if(data.requests.length>=1000)throw Error('本地需求单已达1000笔，请先备份整理');
     data.requests.unshift({id:payload.id,customer:payload.customer.trim(),notes:String(payload.notes||'').slice(0,500),createdAt:new Date().toISOString(),lines:payload.lines.map(l=>({sku:l.sku,qty:l.qty,referencePrice:catalog(l.sku).price})),status:'待报价',sales:[]});save(data);
    }
   }else if(operation==='publish'){
    if(!Array.isArray(payload?.inventory)||payload.inventory.length>10000||!Array.isArray(payload?.updates))throw Error('库存同步格式无效');
    for(const s of payload.inventory)if(!catalog(s.id)||!Number.isInteger(s.stock)||s.stock<0||!Number.isFinite(s.price)||s.price<=0)throw Error('库存或报价无效');
    if(payload.replaceRequests!==undefined){
     if(!Array.isArray(payload.replaceRequests)||payload.replaceRequests.length>1000)throw Error('恢复需求无效');
     const ids=new Set();for(const r of payload.replaceRequests){if(!text(r.id)||!text(r.customer)||ids.has(r.id)||!['待报价','已转销售单','已关闭'].includes(r.status)||!Array.isArray(r.lines)||!r.lines.length||r.lines.length>60)throw Error('恢复需求格式无效');ids.add(r.id);const skus=new Set();for(const l of r.lines){if(!catalog(l.sku)||skus.has(l.sku)||!Number.isInteger(l.qty)||l.qty<1||l.qty>20)throw Error('恢复需求商品无效');skus.add(l.sku)}}
     data.requests=payload.replaceRequests.map(r=>({id:r.id,customer:r.customer,notes:String(r.notes||'').slice(0,500),createdAt:r.createdAt||new Date().toISOString(),lines:r.lines.map(l=>({sku:l.sku,qty:l.qty,referencePrice:catalog(l.sku).price})),status:r.status,sales:[]}));
    }
    data.inventory=payload.inventory.map(s=>({id:s.id,stock:s.stock,physicalStock:Number.isInteger(s.physicalStock)?s.physicalStock:s.stock,reservedStock:Number.isInteger(s.reservedStock)?s.reservedStock:0,price:s.price,priceConfirmed:!!s.priceConfirmed}));
    for(const update of payload.updates){const request=data.requests.find(r=>r.id===update.id);if(!request)continue;if(!['待报价','已转销售单','已关闭'].includes(update.status)||!Array.isArray(update.sales))throw Error('需求状态无效');request.status=update.status;request.sales=update.sales.map(s=>({id:String(s.id),sku:String(s.sku),qty:Number(s.qty),amount:Number(s.amount),status:String(s.status),shippedQty:Number.isFinite(s.shippedQty)?s.shippedQty:Number(s.qty),collected:Number.isFinite(s.collected)?s.collected:(s.status==='已收款'?Number(s.amount):0),fulfillmentStatus:String(s.fulfillmentStatus||'')}))}
    data.updatedAt=new Date().toISOString();save(data);
   }else if(operation!=='read')throw Error('不支持的联动操作');
   parent.postMessage({channel:CHANNEL,id,nonce,ok:true,data},isFile?'*':event.origin);
  }catch(error){parent.postMessage({channel:CHANNEL,id,nonce,ok:false,error:error.message},isFile?'*':event.origin)}
 });
})();
