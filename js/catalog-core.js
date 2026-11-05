/* Shared product definitions. Public prices are reference budgets, not verified stock or costs. */
(function(){
 'use strict';
 const baseProducts=[
 {id:'ohlins',brand:'ÖHLINS',name:'Road & Track DFV',model:'BMS MR40S1',fit:'BMW M2 F87',car:'f87',image:'assets/ohlins.jpg',price:18800,type:'ROAD + TRACK',structure:'单筒 / DFV 阀系',adjust:'25 格 · 压缩 / 回弹联动',use:'street',desc:'面向街道与赛道日的可调悬架方案。以 DFV 阀系、车型适配与调节方式作为选型起点。',source:'https://www.ohlins.com/en-us/automotive/road-and-track/bmw-m2-m3-m4-f87-f80-f82-2015?v=bmw-m2-2021'},
 {id:'kw',brand:'KW SUSPENSIONS',name:'Variant 3',model:'352200BH',fit:'BMW M2 F87',car:'f87',image:'assets/kw.jpg',price:16800,type:'STREET PERFORMANCE',structure:'双筒 / 独立阀系',adjust:'低速压缩 12 格 / 回弹 16 格',use:'street',desc:'针对街道驾驶的独立压缩与回弹调节方案。选型时一并确认车型配置、安装与定位要求。',source:'https://store.kwsuspensions.com/products/kw-coilover-kit-v3-352200bh/'},
 {id:'dssv',brand:'MULTIMATIC',name:'DSSV · Z/28 OE',model:'Camaro Z/28 原厂配套',fit:'Chevrolet Camaro Z/28',car:'z28',image:'assets/dssv.png',price:32800,type:'OE APPLICATION',structure:'DSSV 滑阀',adjust:'OE 车型专属标定',use:'track',desc:'以 Camaro Z/28 原厂应用理解 DSSV 滑阀技术。此处为 OE 方案预算，不代表通用改装套件或跨车型适配。',source:'https://www.multimatic.com/manufacturing/suspension/damping-technology'}
];
 const concepts=[['aurora-formula-core','Formula Core','方程式 · 标准按键','formula-carbon',6800,'碳纤维面板 · 彩色仪表布局'],['aurora-formula-pro','Formula Pro','方程式 · 扩展控制','formula-carbon',9800,'碳纤维面板 · 扩展按键与拨片方案'],['aurora-gt-leather','GT Leather','GT · 打孔皮革','gt-leather',2680,'D 型轮廓 · 打孔皮革 · 紫色缝线'],['aurora-gt-bespoke','GT Bespoke','GT · 个性定制','gt-leather',3680,'D 型轮廓 · 握把尺寸与缝线定制'],['aurora-rally-core','Rally Core','拉力 · 翻毛皮','rally-suede',1980,'圆形深盘 · 翻毛皮 · 绿色中位标'],['aurora-rally-bespoke','Rally Bespoke','拉力 · 个性定制','rally-suede',2980,'握持面料、辐条饰面与中位标定制']].map(([id,name,model,image,price,structure])=>({id,brand:'AURORA',name,model,fit:'按赛车接口与尺寸定制',car:'custom',category:'steering',image:'assets/aurora-products/'+image+'.webp',price,type:'AURORA DESIGN',use:'track',unit:'只',structure,adjust:'按需求配置',desc:'极光方向盘定制设计方案。图示为 AI 辅助设计概念，握把、按键与接口配置需经设计和制造评审后确认。',source:'',priceBasis:'定制方案参考预算，实际报价按配置确认',concept:true}));
 const categoryNames={all:'全部配件',tires:'轮胎',wheels:'轮毂',seats:'赛车座椅',steering:'方向盘',brakes:'制动系统',suspension:'悬架调校',safety:'安全装备',electronics:'数据仪表'};
 window.AURORA_CATALOG_CORE={baseProducts,concepts,categoryNames};
})();
