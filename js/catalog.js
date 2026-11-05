/* Unified catalog consumed by the public storefront and Financial Aurora. */
(function(){
 'use strict';
 const core=window.AURORA_CATALOG_CORE;
 if(!core||!Array.isArray(window.AURORA_CATALOG_ADDITIONS))throw new Error('Aurora catalog dependencies must load before catalog.js');
 const products=[...core.baseProducts.map(p=>({...p,category:'suspension',unit:'套',priceBasis:'人民币参考预算，具体报价与安装条件需确认'})),...window.AURORA_CATALOG_ADDITIONS.map(p=>({...p})),...core.concepts.map(p=>({...p}))];
 const byId=new Map();
 for(const p of products){if(!p.id||byId.has(p.id))throw new Error('Aurora catalog product ID is missing or duplicated');byId.set(p.id,p)}
 const categoryLabel=id=>core.categoryNames[id]||'性能配件';
 window.AuroraCatalog=Object.freeze({version:1,products,baseProducts:core.baseProducts,concepts:core.concepts,categoryNames:core.categoryNames,categoryLabel,get:id=>byId.get(id)});
})();
