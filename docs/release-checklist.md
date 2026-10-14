# Wireflip 发布 checklist

每次正式发布复制本清单，填写版本、负责人和验证证据。未检查的项目保留空框；CI 成功不等于商店已上线、npm 已发布或域名已可访问。

| 项目 | 本次记录 |
|---|---|
| 发布负责人 / 日期 | 待填写 |
| Git commit / PR / CI run | 待填写 |
| 扩展版本 | 当前计划 `2.0.0`，发布前确认 |
| 新 SDK 版本 | 当前计划 `wireflip@0.2.0`，发布前确认 |
| 旧 SDK 文档补丁 | `cors-unlocker@0.1.1` |
| Chrome / Firefox 商店链接 | 待填写 |
| 产物及校验值 | 待填写 |
| 域名验证证据 | 待填写 |

## 1. 兼容边界与发布准备

- [ ] 保留 Chrome ID `knhlkjdfmgkmelcjfnbbhpphkmjjacng` 和 Firefox ID `cors-unlocker@forth.ink`；在原商店条目发布，不新建条目替代旧版。
- [ ] `cors.forth.ink` 持续可访问，旧 `/message/` 桥接保持原域名，不跨域重定向。旧 npm 包不标记 deprecated，不宣布未经决定的下线日期。
- [ ] 本次发布不引入从未正式使用的 Forth Intercept 包名或协议兼容层。
- [ ] 核对扩展 manifest、SDK package.json、ZIP 文件名、文档和发布说明版本一致；确认 npm 上目标版本尚不存在。
- [ ] 确認新包 `wireflip` 名称可发布且发布账号有权限；私下检查 npm / 商店 / Cloudflare 访问权限，不把 token 写入仓库或日志。
- [ ] 记录 Git commit，工作区干净；发布产物来自该 commit 的成功 CI，不混用旧构建。

## 2. 代码与真实浏览器验收

- [ ] TypeScript、ESLint、扩展单元测试、SDK 测试、Chrome/Firefox 生产构建、ZIP 内容检查全部通过，记录 CI run。
- [ ] 真实 Chrome 和 Firefox 验收通过，包括 CORS、凭证、请求/响应头、重定向组合、阻断、延迟、失败及响应模拟/替换。
- [ ] 从已发布的 v1 配置升级，旧设置保留、恢复快照存在，重启浏览器后工作正常。
- [ ] Popup、Workspace、Inspector 的入口、状态颜色、连接提示、语言切换正常；Chrome 调试横幅符合实际会话状态。验证暂停组对应灰色 OFF，其他持久规则保持蓝色、已连接临时控制保持绿色，悬停名称和计数一致；Popup 分组恢复、错误重试及连接中取消可用，重新打开仍能看到错误。
- [ ] Workspace 在桌面和窄窗口均无横向溢出；左侧导航、左下角语言、新建规则/分组、编辑器保存和返回可用。验证切换页面/新建/返回/窄窗口搜索的未保存提示、Ctrl/Cmd+K 和 Ctrl/Cmd+S；六种语言下按钮与内容可用。
- [ ] 连接过程中跨域导航、关闭标签页和停止连接不会让旧规则作用于新页面；并发启动不会重复连接。
- [ ] 创建、移动、重命名和删除规则分组正常；组暂停不改变单条开关，恢复只启用原来开启的规则，Popup/Inspector 状态一致。验证组开关实际影响 CORS/DNR 和已连接会话，且不自动连接；删除暂停组的恢复提示、搜索、窄窗口、备份导入均正常。
- [ ] 停止后临时控制清除，HTTP cache 恢复；持久规则的行为与文档一致。Firefox 不显示不支持的 cache 控件。
- [ ] 在真实测试网页使用 npm **已发布的** `cors-unlocker@0.1.0` 默认导出，验证检测扩展、读取状态、确认/取消启用 CORS、禁用及打开设置；通过旧域名嵌入 iframe 测试，不以访问页面返回 200 代替协议验收。
- [ ] 用准备好的 `0.1.1` 归档重复旧 SDK 验收；确认没有改变 API、打包入口或运行行为。
- [ ] 新 SDK 在实际 HTTPS 网页验证连接、用户取消、扩展缺失、禁用、规则草稿及 Chrome/Firefox 能力差异。SDK 不静默启动拦截，不影响其他 origin。
- [ ] 包内无密钥、真实 Cookie/Authorization、个人请求数据、开发-only 地址或临时测试代码。

## 3. 域名和网站迁移（先保兼容，再切绑定）

- [ ] 验证当前 `https://cors.forth.ink/message/` 返回 200，包含桥接代码；查询参数保留，iframe 未跳到新域名，浏览器无加载或通信错误。
- [ ] 在其他托管部署旧桥接及其资源，接管 `cors.forth.ink`，验证 HTTPS、`/message/` 和所需脚本仍在旧 origin 工作。仅创建 DNS 记录不能完成此步骤。
- [ ] **在上一项完成前，不修改 GitHub Pages 旧绑定或 `public/CNAME`。** 当前 CNAME 保持 `cors.forth.ink`；GitHub Pages 每个站点只能绑定一个自定义域名。
- [ ] 创建 `wireflip.forth.ink` CNAME → `oe.github.io`（DNS-only），再通过 PR 将 `packages/website/public/CNAME` 和 Pages 绑定切到新域名。
- [ ] 新域名证书签发，启用 HTTPS，实际检查首页、`/docs/`、`/migration/`、`/playground/`、`/faq/`、`/privacy/`、图片和静态资源。
- [ ] 旧普通页面 301 到新域名，保留路径和查询参数；`/message`、`/message/` 及桥接需要的 `/_astro/` 资源排除在跨域跳转之外。核对 [部署说明](../packages/website/README.md)。
- [ ] 验证 `https://cors.forth.ink/docs/?from=legacy` 的跳转目标，验证旧桥接未被重定向，且没有循环或 404。
- [ ] 切换后再运行旧 `0.1.0` 和 `0.1.1` 的真实 iframe 协议验收；只有状态码 200 不足以证明兼容。
- [ ] 迁移指南可从旧域名、README、SDK 文档和 FAQ 找到；新域名不可用时仓库链接仍能阅读。

## 4. 商店发布

- [ ] Chrome Web Store 使用已验证的 Chrome ZIP；检查产品名称 Wireflip、简介、权限说明、隐私政策 URL、官网和版本号。
- [ ] 检查已批准 logo、各语言五张 1280×800 截图（包含 Popup）、440×280 宣传图；素材中的功能与发布版本一致。参考 [素材说明](../marketing/chrome-web-store/README.md)。
- [ ] 在原 Chrome 条目提交审核。**提交成功不代表上线**；审核通过后，从商店安装/升级并验证实际版本和核心流程。
- [ ] Firefox 使用已验证的 Firefox 产物完成 AMO 签名/审核；临时加载的 unsigned CI 构建不算正式发布。
- [ ] Firefox 正式版本从实际发布渠道安装/升级，验证 ID、权限及核心流程；若未正式上线，文档继续明确 beta 状态。
- [ ] 发布说明准确描述 Chrome debugger 提示、Firefox body replacement 限制和兼容政策，不承诺 VPN / IP 代理能力。

## 5. 新 npm SDK

- [ ] 商店兼容版本可实际安装，网站和桥接均可用，再准备推广新 SDK。
- [ ] 从同一发布 commit 构建 `packages/npm` 并 pack，检查 package.json 的名称 `wireflip`、版本、exports、类型声明、README 和运行文件。
- [ ] 对**准确的待发布归档**执行 npm dry-run；在干净项目测试 ESM、CommonJS、类型声明和浏览器 SDK，不能只测源码。
- [ ] 负责人审核后发布新包；确认 npm registry 中的版本、dist-tag、归档完整性及 README，而不是只相信 publish 命令成功。
- [ ] 在干净项目从 registry 安装并验证，记录包版本和商店扩展版本。
- [ ] 更新 [迁移指南](../packages/website/src/pages/migration.mdx)、主 README、SDK README、FAQ 和 docs 中“尚未发布”的说明，以真实公开状态为准。不要在新版可用之前删除提醒。

## 6. 旧 npm 文档补丁 `0.1.1`

- [ ] 使用 [准备工具](../release/legacy-sdk/README.md)，不得把新 SDK 改名后发布成旧包，不得从当前 `packages/npm` 重建旧运行代码。

```bash
python3 scripts/prepare-legacy-sdk-patch.py
npm publish ./artifacts/legacy-sdk/cors-unlocker-0.1.1.tgz --dry-run --ignore-scripts
```

- [ ] 工具通过源归档 SHA-512 校验，确认旧 bundles、类型声明、文件列表和入口逐项不变；仅版本和 README 变化。
- [ ] 预览归档 README：兼容仍保留、升级可选、迁移链接可访问、发布状态准确；原 API 文档仍在。文档补丁不应误导为运行修复。
- [ ] 确认 registry 尚无 `0.1.1`；检查账号有旧包发布权限并满足 npm 2FA / 发布认证要求。
- [ ] 优先在新 SDK / 扩展公开可用且迁移状态更新后发布。若提前发布通知，则保留“先检查新版是否可用”的提醒，不能引导用户立即安装未发布的包。
- [ ] 负责人批准后才执行正式发布（以下命令不是准备脚本的一部分）：

```bash
npm publish ./artifacts/legacy-sdk/cors-unlocker-0.1.1.tgz --tag latest --ignore-scripts
```

- [ ] 查询 npm registry 确认版本和 README；重新下载发布后的 `0.1.1`，与 `0.1.0` 对比运行文件和入口，再做真实旧桥接验收。

## 7. 上线后检查与回退

- [ ] 记录商店、npm、新旧域名的验证时间和链接；从普通用户网络再次检查，不仅使用 CI。
- [ ] 核对所有公开文档、商店、安装提示及迁移链接可用，版本和浏览器支持状态一致。
- [ ] 创建/确认本次 Git tag 和 GitHub Release，附已验证的安装归档及校验值；草稿 release 不算已发布。
- [ ] 如新域名失败，先保持旧桥接可用，不把所有旧路径重定向到故障站点；必要时暂停普通页面跳转。若旧域名还依赖 Pages，优先恢复旧 CNAME。
- [ ] npm 版本不可覆盖；有问题时按 npm 策略发布修正版或调整 dist-tag，不盲目 unpublish。文档补丁不改变运行代码，无需为了回退重发旧 bundles。
- [ ] 商店版本不能简单降版本号回滚；保留上一版归档，需要修复时发布更高版本。遇到用户规则问题先保存备份，不清空用户数据。

发布完成判定：所有适用项目已勾选并有证据；未完成的平台或域名明确写为待发布，不能笼统声称全部上线。
