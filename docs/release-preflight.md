# Wireflip 2.0 发布前验收

此记录对应本次发布准备 PR。合并后以主分支成功的 **Build v2 artifacts** 为准，保留其 commit、CI 链接和产物 SHA-256。下列本地验收与外网部署、商店审核、正式发布后的复验是不同步骤。

## 本地验证记录（2026-10-15）

- SDK 单元测试：3/3 通过
- 独立归档消费者：ESM、CommonJS、NodeNext `.mts` / `.cts` 类型检查通过
- 原生 Firefox 157.0.1：三个完整归档验收用例通过，含两个旧 SDK 和新版扩展缺失流程
- 扩展 TypeScript / ESLint、网站生产构建通过
- 商店 12 张图片导出检查通过，并人工检查 Popup、延迟、Mock、Inspector 和宣传图的可读性
- 完整 Chrome 和 Firefox 回归以本 PR 的成功 CI 为最终证据

## 待发布归档

运行：

```bash
pnpm --filter wireflip build
node scripts/verify-sdk-packages.mjs
pnpm --filter website build
```

准备工具只构建、下载、校验和 dry-run，不正式 publish。它会：

- 从 registry 下载准确的 `cors-unlocker@0.1.0`，验证仓库固定的 SHA-512
- 从原归档准备 `0.1.1`，逐文件验证运行 bundles、类型、入口及文件列表不变；只改版本和 README
- pack 当前 `wireflip@0.2.0`，检查 README、exports、运行入口及类型声明，无源码、测试或 sourcemap
- 对新包和文档补丁执行 `npm publish --dry-run --ignore-scripts`；已发布的 `0.1.0` 只做归档检查，不尝试覆盖发布
- 在独立临时项目从新 `.tgz` 离线安装，实际运行 ESM import、CommonJS require，并编译 NodeNext 的 `.mts` 和 `.cts` 消费者

归档及校验值在忽略的 `artifacts/sdk-preflight/`，`packages.json` 记录 commit、各归档 SHA-256、文件列表和消费检查结果。CI 将完整目录作为 `wireflip-sdk-preflight-<commit>` 上传，发布时使用本次成功 CI 的归档，不另行混用本地包。

本轮验收发现并修复新 SDK 的 NodeNext 默认导出类型问题：package 现在明确 ESM 模块类型，ESM 和 CommonJS 分别指向 `.d.ts`、`.d.cts`，运行入口仍分别为 `.mjs`、`.cjs`。

## 真实浏览器 SDK 验收

Chrome 的 `tests/e2e/extension.spec.ts` 新增归档用例；Firefox 单独运行：

```bash
FIREFOX_BINARY=/path/to/firefox GECKODRIVER=/path/to/geckodriver \
  python3 packages/browser-extension/tests/firefox/sdk_package_test.py
```

覆盖：

| 归档 | 验收内容 |
|---|---|
| 发布的 `cors-unlocker@0.1.0` | 默认导出、检测扩展、状态读取、拒绝和确认启用、credentials、禁用、打开已有设置页、其他 origin 不受影响 |
| 文档补丁 `cors-unlocker@0.1.1` | 重复同一完整流程，运行原包的 SDK 文件 |
| 新 `wireflip@0.2.0` | 实际 ESM SDK 连接、浏览器能力、确认/取消、禁用、安全规则草稿、打开设置、origin 隔离、扩展缺失的返回和错误 |

旧包保持原默认 iframe 地址 `https://cors.forth.ink/message/index.html` 和查询参数，使用网站生产构建的桥接页面。验收确认 iframe 实际 origin 仍为 `https://cors.forth.ink`，不修改 SDK 或跨域重定向。Chrome 仅拦截测试域名网络请求，Firefox 通过临时本地 CONNECT/HTTPS 服务提供测试站点；扩展 API、内容脚本、后台和确认窗口均真实运行。临时证书只用于 Firefox 测试会话，不进入发布归档。

**这些检查证明 SDK 和旧桥接代码的协议兼容，不证明公网 DNS、证书和托管已经正确部署。** 切换域名后仍须通过真实公网旧域名重复协议验收。不要把测试路由或自签证书检查当成公网 HTTPS 验收。

## 商店素材

沿用项目 Goldie skill 和已批准的直视、单窗口布局。素材刷新为当前生产 UI，包含分组、紧凑顶栏、左下设置入口和新的 Popup 状态。固定浅色外观，避免构建机器的系统主题影响输出。

- 英文、简体中文各五张 1280×800 截图，包含 Popup
- 440×280 small promo 和可选 1400×560 marquee
- RGB PNG，无透明通道；短文案末尾无句号
- 保留“Sample data / 示例数据”，截图为真实 React UI 配合示例数据，并非真实网络拦截证据
- 捕获前检查 Popup 已加载站点、没有错误提示；导出检查尺寸、文案溢出、完整窗口边界及文案与窗口重叠

文件在 `marketing/chrome-web-store/`。刷新命令见该目录 README；`qa/checks.json` 为忽略的尺寸与布局检查结果。

## 发布时仍必须完成

按 [发布 checklist](release-checklist.md) 执行以下操作，不能因上述验收通过而跳过：

1. 先部署、验证旧域名桥接的独立托管，再切换新域名和 Pages 绑定；旧域名不能下线
2. 从用户网络验证新旧站点、HTTPS、迁移说明及旧 SDK 真实 iframe 通信
3. 原 Chrome 商店条目审核，Firefox AMO 签名/审核，从正式渠道安装与升级后复验
4. 确認 npm 名称与账号发布权限、目标版本可发布，公开状态就绪后发布新 SDK 与旧包文档补丁
5. 更新“未发布 / beta”的文档状态，记录 tag、Release、各渠道链接及准确归档校验值

结论范围：本轮准备完成后可以进入正式发布流程；完整生产上线仍以清单中的域名、渠道及上线后验收为准。

## 升级说明补充验收（2026-10-15）

候选代码 `f756440abe8ad5e3fdf19c6179ecf59435df0816` 已通过
[Build v2 artifacts](https://github.com/oe/cors-unlocker/actions/runs/38620854802)
及 [Website and release packages](https://github.com/oe/cors-unlocker/actions/runs/38620854912)。
扩展单元/组件测试 200 项、Chrome E2E 28 项、Firefox E2E 17 项及三个 SDK
归档的原生 Firefox 验收均通过。Chrome/Firefox 安装 ZIP 的每个文件与受测 CI
产物一致；切换域名后，用本次 CI 的准确旧 SDK 归档再次通过公网旧桥接协议验收。

升级说明为扩展内置页面：v1 更新自动打开一次，确认后跨 Popup/Workspace 同步，
重启不再打开。全新安装和导入他人规则均不显示升级提示。提前收到初版 2.0.0
的 v1 用户，只有原始迁移快照与本地迁移记录一致且包含旧规则时才补发一次。
六种语言、浅色/深色及窄窗口布局已验证。启动检查与更新事件并发时漏发的竞态已
通过先失败、后通过的回归用例复现并修复；说明页打开失败不会关闭已保存的浏览器规则。

域名、商店和 npm 的执行状态见 [发布执行记录](release-execution.md)。
