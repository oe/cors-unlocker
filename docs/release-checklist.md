# Wireflip 发布 checklist

本次执行清单（2026-10-15）。已验证项目勾选；未完成项目保留空框。用户明确豁免的 Firefox 升级说明列为不适用；不以豁免推断其他测试通过。CI 成功不等于商店已上线、npm 已发布或域名已可访问。

| 项目 | 本次记录 |
|---|---|
| 发布负责人 / 日期 | Codex 执行，用户已授权发布 / 2026-10-15 |
| Git commit / PR / CI run | Chrome `f756440`；Firefox `200cb67`；SDK `6ea7424`；[执行记录](release-execution.md) |
| 扩展版本 | 两端均 `2.0.0`；Firefox 保留初版公开包 |
| 新 SDK 版本 | `wireflip@0.2.0` |
| 旧 SDK 文档补丁 | `cors-unlocker@0.1.1` |
| Chrome / Firefox 商店链接 | [Chrome](https://chromewebstore.google.com/detail/knhlkjdfmgkmelcjfnbbhpphkmjjacng) / [Firefox](https://addons.mozilla.org/en-US/firefox/addon/cors-unlocker/) |
| 产物及校验值 | [执行记录](release-execution.md)；本机 `artifacts/release-2026-10-15/` |
| 域名验证证据 | [执行记录](release-execution.md#已完成的公网迁移)；公网旧桥接协议验收通过 |

本轮本地准备和可复现验收见 [发布前验收记录](release-preflight.md)。新旧 SDK 归档验收现在进入 CI；公网域名及正式渠道的检查仍须在发布时填写证据。

## 1. 兼容边界与发布准备

- [x] 保留 Chrome ID `knhlkjdfmgkmelcjfnbbhpphkmjjacng` 和 Firefox ID `cors-unlocker@forth.ink`；在原商店条目发布，不新建条目替代旧版。
- [x] `cors.forth.ink` 持续可访问，旧 `/message/` 桥接保持原域名，不跨域重定向。旧 npm 包不标记 deprecated，不宣布未经决定的下线日期。
- [x] 本次发布不引入从未正式使用的 Forth Intercept 包名或协议兼容层。
- [x] 核对扩展 manifest、SDK package.json、ZIP 文件名、文档和发布说明版本一致；确认 npm 上目标版本尚不存在。
- [x] 确認新包 `wireflip` 名称可发布且发布账号有权限；私下检查 npm / 商店 / Cloudflare 访问权限，不把 token 写入仓库或日志。
- [x] 记录 Git commit，工作区干净；发布产物来自该 commit 的成功 CI，不混用旧构建。

## 2. 代码与真实浏览器验收

- [x] TypeScript、ESLint、扩展单元测试、SDK 测试、Chrome/Firefox 生产构建、ZIP 内容检查全部通过，记录 CI run。 `f756440` 受测候选通过；后续重复 CI 的 Firefox 升级页失败另见文末，未视为通过。
- [x] 真实 Chrome 和 Firefox 验收通过，包括 CORS、凭证、请求/响应头、重定向组合、阻断、延迟、失败及响应模拟/替换。
- [x] 从已发布的 v1 配置升级，旧设置保留、恢复快照存在，重启浏览器后工作正常。
- [x] Chrome 1.x 更新后只自动打开一次本地升级说明页，名称、旧新 logo、规则位置、新功能及浏览器限制准确；确认后 Popup/Workspace 提示同步消失且重启不再出现。全新安装及导入备份的用户不显示提示；已收到初版 2.0.0 的 v1 用户，仅凭本地原始迁移快照补一次说明。后续更新不重复打开；迁移失败显示恢复入口。 **Firefox 本轮不适用：用户明确允许跳过升级说明，保留现有公开包。**
- [x] Popup、Workspace、Inspector 的入口、状态颜色、连接提示、语言切换正常；Chrome 调试横幅符合实际会话状态。验证暂停组对应灰色 OFF，其他持久规则保持蓝色、已连接临时控制保持绿色，悬停名称和计数一致；Popup 分组恢复、错误重试及连接中取消可用，重新打开仍能看到错误。
- [x] Workspace 在桌面和窄窗口均无横向溢出；左侧导航短标签、左下角设置、新建规则/分组、顶栏保存和返回可用。顶栏页面/规则名与当前内容一致，返回列表或切到数据页后无残留编辑操作；宽编辑区名称与分组并排、窄窗口自动换行。验证切换页面/新建/返回/窄窗口搜索的未保存提示、Ctrl/Cmd+K 和 Ctrl/Cmd+S；六种语言下状态提示、按钮与内容可用。
- [x] 设置面板的语言和主题可切换，Escape/点击外部可关闭，重开或刷新后偏好保留，规则草稿不丢失。跟随系统响应系统外观变化，手动浅色/深色不被覆盖；Workspace、Popup、Inspector 跨窗口同步，深色下菜单、表单、代码高亮和提示可读，窄窗口菜单无溢出。
- [x] 连接过程中跨域导航、关闭标签页和停止连接不会让旧规则作用于新页面；并发启动不会重复连接。
- [x] 创建、移动、重命名和删除规则分组正常；组暂停不改变单条开关，恢复只启用原来开启的规则，Popup/Inspector 状态一致。验证组开关实际影响 CORS/DNR 和已连接会话，且不自动连接；删除暂停组的恢复提示、搜索、窄窗口、备份导入均正常。
- [x] 停止后临时控制清除，HTTP cache 恢复；持久规则的行为与文档一致。Firefox 不显示不支持的 cache 控件。
- [x] 在真实测试网页使用 npm **已发布的** `cors-unlocker@0.1.0` 默认导出，验证检测扩展、读取状态、确认/取消启用 CORS、禁用及打开设置；通过旧域名嵌入 iframe 测试，不以访问页面返回 200 代替协议验收。
- [x] 用准备好的 `0.1.1` 归档重复旧 SDK 验收；确认没有改变 API、打包入口或运行行为。
- [x] 新 SDK 在实际 HTTPS 网页验证连接、用户取消、扩展缺失、禁用、规则草稿及 Chrome/Firefox 能力差异。SDK 不静默启动拦截，不影响其他 origin。
- [x] 包内无密钥、真实 Cookie/Authorization、个人请求数据、开发-only 地址或临时测试代码。

### Playground 必测流程（2026-10-16 补充）

之前 SDK 协议测试和官网无插件 UI 测试分开运行，不能据此勾选 Playground 完整链路。后续发布必须附上 [Playground against public Firefox](https://github.com/oe/cors-unlocker/actions/workflows/playground-firefox.yml) 的成功记录；该任务安装哈希校验后的 AMO 签名包，运行构建后的网页和真实扩展 UI。

- [ ] 在目标商店版本上，从默认 Mock 示例完成添加规则、工作区启用、返回 Playground 标签页、Popup 启动会话、测试并核对实际响应内容。不能用 fetch stub、网络路由模拟或 SDK 连接成功替代。
- [ ] 验证无插件、只启用规则但未启动会话、停止会话时不会误导用户发送 Mock 测试；规则关闭而会话仍在运行时必须显示响应不匹配。
- [ ] 先收到可缓存的原始响应，再运行 Mock，仍能得到配置内容。Firefox 保留上游状态码，不把状态差异判为 body replacement 失败。
- [ ] 重复打开规则、刷新网页不重复创建同一草稿；更换配方或编辑规则后重新核对实际配置。公网默认端点与确定性真实 HTTP 端点均需验收。

## 3. 域名和网站迁移（先保兼容，再切绑定）

- [x] 验证当前 `https://cors.forth.ink/message/` 返回 200，包含桥接代码；查询参数保留，iframe 未跳到新域名，浏览器无加载或通信错误。
- [x] 在其他托管部署旧桥接及其资源，接管 `cors.forth.ink`，验证 HTTPS、`/message/` 和所需脚本仍在旧 origin 工作。仅创建 DNS 记录不能完成此步骤。
- [x] 先完成旧桥接独立托管，再修改 Pages 绑定；当前 `public/CNAME` 已为 `wireflip.forth.ink`，操作顺序见执行记录。
- [x] 创建 `wireflip.forth.ink` CNAME → `oe.github.io`（DNS-only），再将 `packages/website/public/CNAME` 和 Pages 绑定切到新域名；按用户指示在当前 main 执行。
- [x] 新域名证书签发，启用 HTTPS，实际检查首页、`/docs/`、`/migration/`、`/playground/`、`/faq/`、`/privacy/`、图片和静态资源。
- [x] 旧普通页面 301 到新域名，保留路径和查询参数；`/message`、`/message/` 及桥接需要的 `/_astro/` 资源排除在跨域跳转之外。核对 [部署说明](../packages/website/README.md)。
- [x] 验证 `https://cors.forth.ink/docs/?from=legacy` 的跳转目标，验证旧桥接未被重定向，且没有循环或 404。
- [x] 切换后再运行旧 `0.1.0` 和 `0.1.1` 的真实 iframe 协议验收；只有状态码 200 不足以证明兼容。
- [x] 迁移指南可从旧域名、README、SDK 文档和 FAQ 找到；新域名不可用时仓库链接仍能阅读。

## 4. 商店发布

- [x] Chrome Web Store 使用已验证的 Chrome ZIP；检查产品名称 Wireflip、简介、权限说明、隐私政策 URL、官网和版本号。
- [x] 检查已批准 logo、各语言五张 1280×800 截图（包含 Popup）、440×280 宣传图；素材中的功能与发布版本一致。参考 [素材说明](../marketing/chrome-web-store/README.md)。
- [x] 在原 Chrome 条目提交审核，设置审核通过后自动发布；后台确认 Pending review。
- [ ] Chrome 审核通过并公开后，从商店安装/升级并验证实际版本和核心流程。
- [x] Firefox 使用已验证的 Firefox 产物完成 AMO 签名/审核；临时加载的 unsigned CI 构建不算正式发布。
- [x] Firefox 正式版本从实际发布渠道安装/升级，验证 ID、权限及核心流程；若未正式上线，文档继续明确 beta 状态。
- [x] 发布说明准确描述 Chrome debugger 提示、Firefox body replacement 限制和兼容政策，不承诺 VPN / IP 代理能力。

## 5. 新 npm SDK

- [x] 商店兼容版本可实际安装，网站和桥接均可用，再准备推广新 SDK。 按浏览器分别判断：Firefox 已公开；Chrome 用户继续保留旧 SDK，直到 2.0 更新实际可用。
- [x] 从同一发布 commit 构建 `packages/npm` 并 pack，检查 package.json 的名称 `wireflip`、版本、exports、类型声明、README 和运行文件。
- [x] 对**准确的待发布归档**执行 npm dry-run；在干净项目测试 ESM、CommonJS、类型声明和浏览器 SDK，不能只测源码。
- [x] 负责人审核后发布新包；确认 npm registry 中的版本、dist-tag、归档完整性及 README，而不是只相信 publish 命令成功。
- [x] 在干净项目从 registry 安装并验证，记录包版本和商店扩展版本。
- [x] 更新 [迁移指南](../packages/website/src/pages/migration.mdx)、主 README、SDK README、FAQ 和 docs 中“尚未发布”的说明，以真实公开状态为准。不要在新版可用之前删除提醒。

## 6. 旧 npm 文档补丁 `0.1.1`

- [x] 使用 [准备工具](../release/legacy-sdk/README.md)，不得把新 SDK 改名后发布成旧包，不得从当前 `packages/npm` 重建旧运行代码。

```bash
python3 scripts/prepare-legacy-sdk-patch.py
npm publish ./artifacts/legacy-sdk/cors-unlocker-0.1.1.tgz --dry-run --ignore-scripts
```

- [x] 工具通过源归档 SHA-512 校验，确认旧 bundles、类型声明、文件列表和入口逐项不变；仅版本和 README 变化。
- [x] 预览归档 README：兼容仍保留、升级可选、迁移链接可访问、发布状态准确；原 API 文档仍在。文档补丁不应误导为运行修复。
- [x] 确认 registry 尚无 `0.1.1`；检查账号有旧包发布权限并满足 npm 2FA / 发布认证要求。
- [x] 优先在新 SDK / 扩展公开可用且迁移状态更新后发布。若提前发布通知，则保留“先检查新版是否可用”的提醒，不能引导用户立即安装未发布的包。
- [x] 负责人批准后才执行正式发布（以下命令不是准备脚本的一部分）：

```bash
npm publish ./artifacts/legacy-sdk/cors-unlocker-0.1.1.tgz --tag latest --ignore-scripts
```

- [x] 查询 npm registry 确认版本和 README；重新下载发布后的 `0.1.1`，与 `0.1.0` 对比运行文件和入口，再做真实旧桥接验收。

## 7. 上线后检查与回退

- [x] 记录商店、npm、新旧域名的验证时间和链接；从普通用户网络再次检查，不仅使用 CI。
- [x] 核对所有公开文档、商店、安装提示及迁移链接可用，版本和浏览器支持状态一致。
- [x] 创建 SDK tag / [GitHub Release](https://github.com/oe/cors-unlocker/releases/tag/sdk-v0.2.0)，绑定 `6ea7424`，附两个准确 registry 归档与 SHA256SUMS。
- [ ] Chrome 公开并完成商店复验后创建扩展最终 Release；区分两端实际源码提交。
- [x] 如新域名失败，先保持旧桥接可用，不把所有旧路径重定向到故障站点；必要时暂停普通页面跳转。若旧域名还依赖 Pages，优先恢复旧 CNAME。（回退预案已确认；本轮无需执行回退。）
- [x] npm 版本不可覆盖；有问题时按 npm 策略发布修正版或调整 dist-tag，不盲目 unpublish。文档补丁不改变运行代码，无需为了回退重发旧 bundles。（回退预案已确认；本轮无需执行回退。）
- [x] 商店版本不能简单降版本号回滚；保留上一版归档，需要修复时发布更高版本。遇到用户规则问题先保存备份，不清空用户数据。（回退预案已确认；本轮无需执行回退。）

发布完成判定：所有适用项目已勾选并有证据；未完成的平台或域名明确写为待发布，不能笼统声称全部上线。

## 本轮证据与范围

- Chrome 提交包来自成功 CI `38620854802` / `38620854912` 的 `f756440`，28 项 Chrome E2E 通过；200 项扩展单元/组件测试通过。
- Firefox 保留 `200cb67` 的公开 2.0.0，AMO 文件 `5122149`；不上传本地后续候选，不增加版本号。
- 后续完整 CI `38624777940`、`38662680590` 的 Firefox 升级说明用例未通过；这项不属于用户要求保留的公开 Firefox 包，按用户明确指示跳过本轮 Firefox 升级页，不声称该用例通过。
- 正式 Firefox 2.0.0 已按原签名 XPI 安装：本机和 CI 的三个 SDK 归档验收均通过。除 `META-INF/` 签名外，全部 23 个运行文件与初版受测构建逐字节相同。
- npm 单独验证准确归档与正式 AMO 包：[SDK release against public Firefox](https://github.com/oe/cors-unlocker/actions/runs/38663236037)。该验收已全绿；网站及 README 明确 Chrome 仍待审核。
- npm registry 验证、干净项目安装及公网旧桥接复验已完成，证据在 `npm-6ea7424/registry/`。总体发布仍有空框，不能宣称 checklist 全部完成。

官网最终状态由成功部署 `38664474401` / `38664591420` 及真实公网首页、Docs、Migration、FAQ 的正文和全站页脚核验确认；浏览器再次确认 Firefox 安装入口与 Chrome 待审核提示。最后仅剩上面的两个 Chrome 上线相关空框。
