# Financial Aurora

极光工作室财务工作台。独立静态前端项目，包含财务总览、采购、库存、SKU 与销售、报销与付款、工资、研发、预算、报表和整车 BOM。无需主站的 CSS、JavaScript 或构建工具即可运行。

## 本地运行

在项目目录运行 Python 3.10 或更新版本：

```sh
python -m http.server 8080
```

浏览器打开 `http://localhost:8080/`。本地图片完整保留在 `assets/`，字体在 `fonts/`。哈希路由不需要服务器重写。

## 打包

```sh
python scripts/build.py
```

输出到 `release/`：

- `Financial-Aurora-v1.0.0-deploy.zip`：根目录即 `index.html`，带 `css/`、`js/`、`fonts/`，不含图片。
- `Financial-Aurora-v1.0.0-images.zip`：完整 `assets/` 图片目录。
- `Financial-Aurora-v1.0.0-manifest.json`：每个文件的 SHA-256、图片 URL、上传前缀与校验状态。

发布参数在 `release.config.json` 中。默认图片根地址：

```text
https://cdn.aurora-racing.com/financial-aurora/v1.0.0/assets/
```

也可临时指定：

```sh
python scripts/build.py --cdn https://cdn.aurora-racing.com/financial-aurora/v1.0.1/assets/ --output release-next
```

图片 ZIP 中的 `assets/` 上传至七牛 `financial-aurora/v1.0.0/` 前缀下，然后部署网站 ZIP。新增图片须使用新的不可变版本目录。生产 CDN 尚待上传，打包成功不代表线上 CDN 已经可用。该独立项目使用自己的 CDN 前缀，不覆盖 Performance Lab 的已有图片。

构建仅依赖 Python 标准库，保持脚本和样式加载顺序；ZIP 时间固定于配置日期，内容相同的重复构建可复现。源码、开发启动工具、测试证据和密钥不会打入部署包。字体及其 OFL 许可保留在部署包。

## 数据与集成边界

- 既有 BOM 和标准表数据、业务计算、存储键与页面逻辑保留。`docs/SOURCE-PROVENANCE.json` 记录抽取源和文件哈希。
- 资金图表按用户要求使用展示分布；月度合计关联当前工作区，不能当成原始逐日凭证。原始收支记录单独保留。
- 业务记录在当前浏览器的 `localStorage`；换域名、换设备不会自动迁移，发布前请用管理设置导出备份，再在新站导入。仓库不含任何浏览器的私人存储导出。
- SKU 目录快照来自已有商城；本地 `js/finance-bridge.html` 保留同源报价与库存桥接。独立域名与商城不会跨域自动共享浏览器存储。商城详情为外部链接，真实跨域订单同步需单独部署并授权后端接口。
- 飞书 OA 尚未接入；没有真实自动支付、银行连接、服务器账套或多人权限后端。静态页面的管理员显示不构成身份认证。
- 赛车使用透明多视角图与预计算 WebGL 粒子重组，属于多视角展示，不是真正的三维几何模型。渲染不读取跨域图片像素。

## 维护

`index.html` 为入口；`css/` 为样式；`js/` 包含数据、页面和业务逻辑；`assets/` 为图片；`fonts/` 为字体。动态图片统一经 `AuroraAssetURL` 生成；HTML 图片由构建器转换为同一 CDN 前缀。更新图像时同时重建完整图片 ZIP，避免新页面引用缺失素材。

详细部署步骤与版本变化见 `docs/RELEASE-v1.0.0.md`。项目未授予第三方品牌图片、赞助商标识、字体以外资产的再许可；发布范围应遵循各素材既有授权。
