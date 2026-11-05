(() => {
 'use strict';
 const source=new URL(document.currentScript.src), bridgeURL=new URL('finance-bridge.html',source);
 const frame=document.createElement('iframe');frame.hidden=true;frame.title='Aurora 本地数据联动';frame.src=bridgeURL.href;
 const isFile=bridgeURL.protocol==='file:';
 const channel='aurora-commerce-v1',nonce=crypto.randomUUID?.()||String(Math.random()),pending=new Map();
 let sequence=0,loaded=false,last='',state=null;
 const loadedPromise=new Promise(resolve=>frame.onload=()=>{loaded=true;resolve()});
 const events=new EventTarget();
 async function call(operation,payload){await Promise.race([loadedPromise,new Promise((_,reject)=>setTimeout(()=>reject(Error('联动组件未加载')),6000))]);return new Promise((resolve,reject)=>{const id=String(++sequence),timer=setTimeout(()=>{pending.delete(id);reject(Error('联动超时，请重新打开网站'))},6000);pending.set(id,{resolve,reject,timer});frame.contentWindow.postMessage({channel,nonce,id,operation,payload},isFile?'*':bridgeURL.origin)})}
 window.addEventListener('message',event=>{const d=event.data;if(event.source!==frame.contentWindow||(isFile?!['null','file://'].includes(event.origin):event.origin!==bridgeURL.origin)||d?.channel!==channel||d.nonce!==nonce)return;const item=pending.get(d.id);if(!item)return;pending.delete(d.id);clearTimeout(item.timer);if(!d.ok){item.reject(Error(d.error));return}state=d.data;const serialized=JSON.stringify(state);if(serialized!==last){last=serialized;events.dispatchEvent(new CustomEvent('change',{detail:state}))}item.resolve(state)});
 window.AuroraCommerce=Object.freeze({read:()=>call('read'),request:payload=>call('request',payload),publish:payload=>call('publish',payload),onChange:fn=>events.addEventListener('change',event=>fn(event.detail)),get snapshot(){return state},financeURL:new URL('../index.html',source).href,shopURL:window.AuroraReleaseConfig.shopURL});
 document.body.append(frame);
 const poll=()=>{if(!document.hidden&&loaded)call('read').catch(()=>{})};setInterval(poll,2500);window.addEventListener('focus',poll);poll();
})();
