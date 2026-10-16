# Wireflip 发布执行记录 — 2026-10-15，更新于 2026-10-16

当前 Chrome 和 Firefox 2.0.0 均已公开。2026-10-16 已通过 Google 官方更新服务下载 Chrome 公开 CRX，28 个运行文件与提交审核的 ZIP 逐字节一致；官方 Chrome 155.0.8059.39 已通过原生商店策略安装、公开条目及核心 Playground 链路验收。旧 SDK 和域名兼容继续保留。真实已有 v1 用户原地升级仍需单独补验，不用全新安装或旧数据夹具测试代替。

## 2026-10-16 Chrome 公开渠道复验

- 扩展 ID `knhlkjdfmgkmelcjfnbbhpphkmjjacng`，公开版本 `2.0.0`，对应源码 `f756440abe8ad5e3fdf19c6179ecf59435df0816`
- 公开 CRX SHA-256：`fb7a4615a389e8dde3cc96ed878b69101af13ff0ecc91243c7313020cff0982e`
- 提交 ZIP SHA-256：`59b7f60717ecdbd8eb77af34253f7e3519f6f8051e605099af50934306ef72e6`
- 28 个运行文件逐字节相同，manifest 除商店管理的 key/update 元数据外相同；[永久文件指纹](../release/chrome-store-2.0.0.json) 避免验收依赖短期 CI 归档
- 官方 Chrome 原生策略通过公开 Web Store 更新地址安装签名包，不使用 unpacked 加载；安装后的 JS/HTML/CSS 与公开包逐字节相同，Chrome 安装时规范化的 locale JSON 核对实际消息内容，PNG 不以安装后的重编码字节判断篡改
- 公开商店条目显示 Wireflip 2.0.0；全新安装无升级说明误弹
- 真实工作区开关、Popup 原生会话、Mock 内容校验、工具栏 ON/停止联动、关闭规则后不匹配、刷新后不重复创建规则均覆盖；流程不 stub fetch、扩展 API 或 debugger
- 此验收发现 Chrome 默认 Mock 配方缺少 `Access-Control-Allow-Origin`，已补齐。未经自定义的旧默认配方会换为修正后的 `/todos/2` 配方，旧 `/todos/1` 规则不会覆盖它；自定义配置保留
- [Chrome 验收任务](https://github.com/oe/cors-unlocker/actions/workflows/chrome-store-verification.yml)：PR 测构建后的网站，main 合并后等待部署并复验真实 HTTPS 官网。[Firefox 商店版复验](https://github.com/oe/cors-unlocker/actions/workflows/playground-firefox.yml) 同时覆盖修正后的配方
- 仓库、SDK README 和当前 checklist 同步正式发布状态；已发布 npm 0.2.0 的 README 属于旧归档内容，不能原版本覆写，本轮不为状态文案重发包。已有 SDK GitHub Release 的待审核说明在 main 商店验收通过后自动更正
- 保留尚未完成的真实旧 Chrome profile 原地升级及扩展最终 GitHub Release 项目

以下为 2026-10-15 的提交、审核及 npm 发布历史，涉及“待审核”的文字描述当时状态。

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
| Firefox AMO | 原条目的初版 2.0.0 已公开，文件 ID `5122149`、版本 ID `6578016`；此包不包含本次新增升级说明 | 按用户最终决定保留公开包，不升级版本、不重传源码；用户进一步明确 Firefox 不需要升级页，本轮该项不适用 |
| Firefox 商店资料 | 新名称 Wireflip、logo、英文说明、官网/支持链接及初版 2.0.0 的对应源码已保存；五张 Firefox 专用新截图、对应标题和顺序已保存，公开页面与 AMO API 均确认生效 | 已完成本轮资料更新 |
| npm | [`wireflip@0.2.0`](https://www.npmjs.com/package/wireflip) 与 [`cors-unlocker@0.1.1`](https://www.npmjs.com/package/cors-unlocker) 已公开，latest 指向正确版本；registry 归档 SHA-256/SHA-512 与成功 CI 完全一致；干净安装、ESM/CJS/NodeNext 类型及公网旧桥接复验通过 | npm 发布与验证完成；Chrome 用户按迁移指南继续保留旧 SDK，直到商店更新可安装 |

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

## 2026-10-15 当时的剩余检查（历史）

1. 等待 Chrome 审核及自动发布；当前仍为待审核，不能声称全部上线。
2. 从公开 Chrome 渠道安装/升级并验收，确认老用户一次说明、新安装不显示提示、原有规则保留。Firefox 公开包的核心 SDK 流程已复验完成。
3. Chrome 公开后同步更新 Chrome 待审核文案，并补正式商店版验收。npm 已完成发布，无需再等待 Chrome。
4. SDK 已有独立 tag / Release；扩展完整上线后创建扩展最终 Release，分别记录 Chrome 与 Firefox 对应提交和准确产物，不把未发布的 Firefox 候选当成商店包。

商店 ID、旧 SDK 默认桥接、原有规则和配置均继续保留。

## npm 发布验收补充

- 发布归档更新为 SDK 提交 `6ea7424c06a2463d736276a04e3bf7791210cb49` 的成功 CI：[SDK release against public Firefox](https://github.com/oe/cors-unlocker/actions/runs/38663236037)。只更新新 SDK README 的准确浏览器发布状态，运行文件与 `f756440` 逐字节相同。
- 全部三个 SDK 归档通过正式 AMO 2.0.0 原签名 XPI 的真实安装及通信验收；CI 和本机官方 Firefox 157.0.1 均为 3/3。正式 XPI 除 `META-INF/` 签名外，全部 23 个文件与初版受测构建一致。
- 新 SDK README 明确要求 Wireflip 2.0：Firefox 已公开，Chrome 尚待审核，Chrome 用户继续保留旧 SDK。
- 准确已发布归档 SHA-256：`wireflip-0.2.0.tgz` 为 `7d3fd6306a4e41ab2b052cac9a359c32b16fea2923cf13f80d33a216765fda7e`；`cors-unlocker-0.1.1.tgz` 为 `300638ddadf913726ce5f4f62c1db0bcefdb863f7fce142e72aec1c94b8659bd`。上文 `f756440` 的 SDK 归档保留为历史候选，未发布。
- 发布账号 `evecalm` 已完成本次发布要求的二次验证；两个 publish 命令返回成功，未重复提交同一版本。
- 后续完整扩展 CI 的 Firefox 升级说明测试失败仍如实记录；用户明确 Firefox 不需要升级页面，本轮不作为发布要求。没有声称该测试通过，也未替换 AMO 公开包。
- 本机记录及准确产物：`artifacts/release-2026-10-15/npm-6ea7424/`。

## npm 发布后验证结果

- registry 实际公开时间：`wireflip@0.2.0` 于 2026-10-15 09:05:58 CST 下载核验；`cors-unlocker@0.1.1` 于 09:07:03 CST 下载核验。两者 latest 均指向本次版本，归档 SHA-256 见上节，SHA-512 见本机 `registry/verification.json`。
- 从 registry 在独立目录、全新 npm cache 安装 `wireflip@0.2.0`；ESM、CommonJS、NodeNext `.mts` / `.cts` 类型消费均通过，实际安装的全部 7 个文件与 CI 归档逐字节相同。
- 重新下载的旧包 0.1.1 的 bundles、类型声明及入口与公开 0.1.0 相同；用 registry 归档再次通过公网 `cors.forth.ink` 的检测、状态、取消/确认、credentials、origin 隔离、禁用及设置入口。
- [SDK GitHub Release](https://github.com/oe/cors-unlocker/releases/tag/sdk-v0.2.0) 绑定 SDK 提交 `6ea7424`，附两个实际 registry 归档及 SHA256SUMS。它不代表 Chrome 已公开；发布说明保留 Chrome 待审核状态。
- 网站首页、安装文档、迁移页、FAQ、仓库 README 更新为真实浏览器/SDK 状态；Firefox beta 文案已替换为正式 AMO 链接。扩展完整发布仍等待 Chrome 审核和正式渠道复验。
- Firefox 升级说明本轮不适用（用户明确无需）；此前等待两商店同时就绪不是 npm 的硬性限制。

## 2026-10-15 官网状态与未完成项（历史）

- 官网状态更新部署：[Website and release packages](https://github.com/oe/cors-unlocker/actions/runs/38664474401) 与 [Pages deployment](https://github.com/oe/cors-unlocker/actions/runs/38664591420) 均成功，对应网站提交 `79d0be6`。
- 普通公网访问及浏览器复验：首页、Docs、Migration、FAQ 均显示 npm 已公开、Firefox 2.0 可安装、Chrome 2.0 待审核；全站页脚不再包含 Firefox beta / Chrome stable 的旧状态，安装按钮指向正式 AMO 条目。
- 清单仅保留两项未完成：Chrome 审核通过并公开后的正式安装/升级复验，以及此后扩展最终 Release。SDK Release 已完成。
- Firefox 升级说明页按用户要求不适用；没有增加扩展版本号，没有重传已公开 Firefox 2.0.0。
