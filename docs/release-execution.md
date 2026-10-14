# Wireflip 发布执行记录 — 2026-10-15

代码验收完成；最新扩展候选仍为 2.0.0。商店发布及 npm 发布尚未全部完成。

## 受测候选与产物

代码提交：`f756440abe8ad5e3fdf19c6179ecf59435df0816`。

- [Build v2 artifacts](https://github.com/oe/cors-unlocker/actions/runs/38620854802)：成功；200 项扩展单元/组件测试、28 项 Chrome E2E、17 项 Firefox E2E、三个 SDK 归档的原生 Firefox 验收通过。
- [Website and release packages](https://github.com/oe/cors-unlocker/actions/runs/38620854912)：成功；发布 ZIP 与上述受测文件逐一比对一致。
- 新 SDK 的 ESM、CommonJS、NodeNext 类型消费及准确归档的 npm dry-run 通过。
- Firefox 验证使用官方 Firefox 157.0.1、geckodriver 0.37.1，以及商店签名的旧版 1.1.0；旧版归档 SHA-256 固定校验。
- Chrome 使用真实浏览器的 1.1.0 → 2.0.0 更新事件和 v1 存储夹具；正式商店安装/升级仍需上线后复验。

| 待发布归档 | SHA-256 |
| --- | --- |
| `wireflip-chrome-v2.0.0.zip` | `59b7f60717ecdbd8eb77af34253f7e3519f6f8051e605099af50934306ef72e6` |
| `wireflip-firefox-v2.0.0.zip` | `21fe7d6b1a97ee35818c29d96d09ab82719a6972913353921b301b474d02b09f` |
| `wireflip-0.2.0.tgz` | `7d6eaf997eb8de1dd7d4f8c31a7324032a5ad6ecb6c79acba842c7860d9b8fcd` |
| `cors-unlocker-0.1.1.tgz` | `fa7ec42d75d3433e320d55c3846c51d9d295c6ca6141fe73a9d81d1bc2bb3488` |

本机受测文件、源码 ZIP、CI 日志、完整校验值及公网桥接结果保存在
`artifacts/release-2026-10-15/f756440/`（该目录未提交）；CI 产物可从上面的运行页面下载。
旧包 0.1.1 仅改变版本和 README，运行 bundles、类型声明及入口保持原版 0.1.0 的准确字节。

## 已完成的公网迁移

- `cors.forth.ink` 已由独立 Cloudflare Pages 项目 `cors-unlocker-legacy` 承载，保留旧桥接 origin。
- `wireflip.forth.ink` 已绑定 GitHub Pages，HTTPS 证书有效，首页、文档、迁移、Playground、FAQ、隐私页和静态资源已验证。
- 旧普通页面保留路径及查询参数 301 到新域名；`/message`、`/message/` 与 `/_astro/` 保持旧域名服务。
- 最新受测扩展及准确 `cors-unlocker@0.1.0` / `0.1.1` 归档通过真实公网旧域名 iframe 通信，覆盖检测、状态、取消/确认、凭证、origin 隔离、禁用和打开设置。

## 商店与 npm 状态

| 渠道 | 当前状态 | 后续步骤 |
| --- | --- | --- |
| Chrome Web Store | 原条目仍公开 1.1.0；2.0.0 草稿已接受补充说明的包，中英文介绍及各五张截图、logo、宣传图、权限/隐私说明、审核步骤已保存 | 桌面解锁后，将草稿包替换为上面最后成功 CI 的 Chrome ZIP，再提交审核；审核通过后安装/升级复验 |
| Firefox AMO | 原条目的初版 2.0.0 已公开，文件 ID `5122149`、版本 ID `6578016`；此包不包含本次新增升级说明 | 已公开版本无法同版本更新已安装用户，需要更高的 Firefox 版本号；待决定仅 Firefox 2.0.1 或两端统一 2.0.1 后构建、验收及提交 |
| Firefox 商店资料 | 新名称 Wireflip、logo、英文说明、官网/支持链接及初版 2.0.0 的对应源码已保存；Firefox 专用五张新截图已上传到编辑表单 | 桌面解锁后核对五张新图的标题/顺序，替换旧图库并保存；旧三张图库已在本机备份 |
| npm | 发布账号已登录并有旧包发布权限；新包和文档补丁已验收，尚未正式 publish | 兼容的正式商店版本可实际安装后，发布 `wireflip@0.2.0` 和 `cors-unlocker@0.1.1`，再验证 registry 与准确下载归档 |

商店表单操作因本机 Mac 锁定而中断，需恢复桌面交互。Firefox 初版 2.0.0
的已保存源码对应旧受测提交 `200cb674f15fbc63c35525bbdd701d75f8e3b7a2`；
新升级说明应随更高版本的新文件和对应源码发布。

## 完成发布前的剩余检查

1. 恢复商店页面操作，决定 Firefox 必须使用的新版本号。
2. 使用同一成功 CI 提交的准确产物，在原 Chrome / Firefox 条目完成提交与审核。
3. 从公开渠道安装/升级并验收，确认老用户一次说明、新安装不显示提示、原有规则保留。
4. 商店公开就绪后发布两个 npm 包，验证 registry 版本、dist-tag、归档及真实浏览器调用。
5. 按实际公开状态更新安装、迁移及 beta 文案，创建最终 tag / Release 并附准确产物与校验值。

商店 ID、旧 SDK 默认桥接、原有规则和配置均继续保留。
