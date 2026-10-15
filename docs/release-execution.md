# Wireflip 发布执行记录 — 2026-10-15

代码验收完成；两端版本均保持 2.0.0。Chrome 最新包已提交审核，Firefox 保留已公开的初版 2.0.0；npm 发布尚未完成。

## 受测候选与产物

代码提交：`f756440abe8ad5e3fdf19c6179ecf59435df0816`。

- [Build v2 artifacts](https://github.com/oe/cors-unlocker/actions/runs/38620854802)：成功；200 项扩展单元/组件测试、28 项 Chrome E2E、17 项 Firefox E2E、三个 SDK 归档的原生 Firefox 验收通过。
- [Website and release packages](https://github.com/oe/cors-unlocker/actions/runs/38620854912)：成功；发布 ZIP 与上述受测文件逐一比对一致。
- 新 SDK 的 ESM、CommonJS、NodeNext 类型消费及准确归档的 npm dry-run 通过。
- Firefox 验证使用官方 Firefox 157.0.1、geckodriver 0.37.1，以及商店签名的旧版 1.1.0；旧版归档 SHA-256 固定校验。
- Chrome 使用真实浏览器的 1.1.0 → 2.0.0 更新事件和 v1 存储夹具；正式商店安装/升级仍需上线后复验。

| 已验收归档 | SHA-256 |
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
| Chrome Web Store | 2026-10-15 08:53 CST 已提交 `f756440` 对应的最新 2.0.0 ZIP；后台显示 **Pending review** / **This draft is pending review**；已勾选审核通过后自动发布 | 等待审核；公开后从商店安装/升级复验 |
| Firefox AMO | 原条目的初版 2.0.0 已公开，文件 ID `5122149`、版本 ID `6578016`；此包不包含本次新增升级说明 | 按用户最终决定保留公开包，不升级版本、不重传源码；后续发布时再带入升级说明 |
| Firefox 商店资料 | 新名称 Wireflip、logo、英文说明、官网/支持链接及初版 2.0.0 的对应源码已保存；五张 Firefox 专用新截图、对应标题和顺序已保存，公开页面与 AMO API 均确认生效 | 已完成本轮资料更新 |
| npm | registry 复查：`wireflip` 尚不存在，`cors-unlocker` latest 仍为 0.1.0；发布账号已登录，两个准确归档已验收 | 等 Chrome 兼容版本公开可安装后，发布 `wireflip@0.2.0` 和 `cors-unlocker@0.1.1`，再验证 registry 与准确下载归档 |

用户最终决定：Firefox 保持现有公开 2.0.0，Chrome 使用补充升级说明后的 2.0.0，
无需增加版本号。已明确说明 AMO 已公开版本不能同版本替换，因此 Firefox 本轮没有新增升级说明。
仓库版本没有改为 2.0.1。两端版本号相同，但已发布/提交的源码提交不同：

- Chrome：`f756440abe8ad5e3fdf19c6179ecf59435df0816`，含旧用户一次升级页，全新安装不提示。
- Firefox：`200cb674f15fbc63c35525bbdd701d75f8e3b7a2`，保留原公开文件及匹配的源码 ZIP。
- Firefox 公开 XPI SHA-256：`37828cb7a9695964b79e4b583ddb31d7c61c15bb8701f82668bb8cd633831301`。
- 上表中的 `f756440` Firefox ZIP 仅为已验收候选，**未向 AMO 发布，不代表公开 Firefox 的包**。

Chrome 已保存中英文介绍、各五张截图、logo、宣传图、权限/隐私说明及审核步骤。
提交时没有选择“只改安全静态规则而跳过审核”；审核通过后自动发布已启用。
本机证据：`f756440/chrome-pending-review.png`、`amo-public.png`、`amo-public-metadata.json`。

## 完成发布前的剩余检查

1. 等待 Chrome 审核及自动发布；当前仍为待审核，不能声称全部上线。
2. 从公开 Chrome 渠道安装/升级并验收，确认老用户一次说明、新安装不显示提示、原有规则保留；Firefox 按保留公开版本的范围复验核心流程。
3. Chrome 公开就绪后发布两个 npm 包，验证 registry 版本、dist-tag、归档及真实浏览器调用。
4. 按实际公开状态更新安装、迁移及 beta 文案，创建最终 tag / Release；分别记录 Chrome 与 Firefox 对应提交和准确产物，不把未发布的 Firefox 候选当成商店包。

商店 ID、旧 SDK 默认桥接、原有规则和配置均继续保留。
