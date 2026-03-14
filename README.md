# 理性投资系统

这个仓库现在是一个可本地运行的“主动推送版”投资决策系统，目标是把你的投资心得整理成：

- 可持续更新的心得规则库
- 可批量维护的自选股池
- 每日自动运行的技术面决策引擎
- 飞书机器人主动推送日报
- 可视化控制台

## 当前结构

- [notifier.mjs](/C:/Users/T14s/Documents/New%20project/notifier.mjs): 主引擎，抓取行情、计算技术指标、给出买卖结论并推送飞书
- [notifier.ps1](/C:/Users/T14s/Documents/New%20project/notifier.ps1): Windows 启动入口
- [feishu_listener.mjs](/C:/Users/T14s/Documents/New%20project/feishu_listener.mjs): 飞书事件回调监听服务，负责接收你的飞书消息并写回系统
- [listener.ps1](/C:/Users/T14s/Documents/New%20project/listener.ps1): 飞书监听服务启动入口
- [config/philosophy.md](/C:/Users/T14s/Documents/New%20project/config/philosophy.md): 主心得规则库
- [config/watchlist.json](/C:/Users/T14s/Documents/New%20project/config/watchlist.json): 自选股配置
- [config/feedback_inbox.md](/C:/Users/T14s/Documents/New%20project/config/feedback_inbox.md): 增量心得收件箱
- [config/company_profiles.json](/C:/Users/T14s/Documents/New%20project/config/company_profiles.json): 每家公司基本面/治理/叙事/风险画像
- [.state/latest_report.json](/C:/Users/T14s/Documents/New%20project/.state/latest_report.json): 最新日报输出
- [index.html](/C:/Users/T14s/Documents/New%20project/index.html): 本地查看面板

## 使用方式

先配置飞书 webhook：

```powershell
$env:FEISHU_WEBHOOK_URL="https://open.feishu.cn/open-apis/bot/v2/hook/xxxx"
```

然后运行：

```powershell
powershell -ExecutionPolicy Bypass -File .\notifier.ps1
```

也可以直接运行：

```powershell
node .\notifier.mjs
```

## 飞书更新心得

如果你想通过飞书消息直接更新系统，需要同时具备两部分：

- 现有 `webhook` 机器人：负责主动推送日报
- 飞书自建应用机器人：负责接收你发来的消息

本仓库已经实现了接收端 [feishu_listener.mjs](/C:/Users/T14s/Documents/New%20project/feishu_listener.mjs)。

### 1. `.env` 需要补齐

```powershell
FEISHU_WEBHOOK_URL=你的日报机器人 webhook
FEISHU_APP_ID=你的飞书应用 App ID
FEISHU_APP_SECRET=你的飞书应用 App Secret
FEISHU_VERIFICATION_TOKEN=事件订阅校验 token
FEISHU_ENCRYPT_KEY=事件订阅加密 key
FEISHU_LISTENER_PORT=8787
```

### 2. 启动监听服务

```powershell
powershell -ExecutionPolicy Bypass -File .\listener.ps1
```

启动后会暴露：

- `POST /feishu/events`
- `GET /healthz`

### 3. 在飞书后台配置

你需要在飞书开放平台给这个应用开启：

- 机器人能力
- 事件订阅
- 消息事件 `im.message.receive_v1`

事件回调地址填你自己的可访问地址，例如：

```text
https://你的域名/feishu/events
```

如果你先在本机调试，可以把本地 `8787` 端口通过 `ngrok`、`cloudflared tunnel` 之类的方式暴露出去。

### 4. 目前支持的飞书指令

```text
心得：牛市里利空不跌，是最重要的持仓信号
加入自选股：TSM | 台积电 | 制造/电子 | us
移除自选股：AAPL
更新公司：0700.HK | 逻辑=广告恢复与AI商业化 | 基本面=improving | 估值=reasonable | 催化剂=视频号变现,游戏新品
帮助：
```

这些指令会自动写回：

- [config/philosophy.md](/C:/Users/T14s/Documents/New%20project/config/philosophy.md)
- [config/watchlist.json](/C:/Users/T14s/Documents/New%20project/config/watchlist.json)
- [config/company_profiles.json](/C:/Users/T14s/Documents/New%20project/config/company_profiles.json)
- [.state/feishu_inbox.log](/C:/Users/T14s/Documents/New%20project/.state/feishu_inbox.log)

## 如何更新系统

1. 在 [config/philosophy.md](/C:/Users/T14s/Documents/New%20project/config/philosophy.md) 追加或重写你的心得体系。
2. 在 [config/watchlist.json](/C:/Users/T14s/Documents/New%20project/config/watchlist.json) 维护自选股。
3. 在 [config/company_profiles.json](/C:/Users/T14s/Documents/New%20project/config/company_profiles.json) 维护每家公司的长期逻辑、短期增长、估值、治理、资本运作、风险与催化剂。
4. 如果你临时想到新的观察点，先记到 [config/feedback_inbox.md](/C:/Users/T14s/Documents/New%20project/config/feedback_inbox.md)。
5. 重新运行 `notifier.ps1`，系统会生成最新日报并推送飞书。

## 当前能力边界

- 现在已经支持“每日主动推送”和“多标的技术信号判断”。
- 现在的结论以公司画像和你的心得规则为主，技术指标只负责确认节奏、位置和风险。
- “飞书回复后自动写回系统”现在代码已经具备，但还需要你在飞书开放平台创建应用并配置事件订阅。

## 定时运行建议

推荐两种方式：

- Windows 任务计划程序：每天北京时间 `08:30` 执行 [notifier.ps1](/C:/Users/T14s/Documents/New%20project/notifier.ps1)
- Codex 自动化：如果你希望完全交给 Codex 定时跑，我可以下一步直接帮你加一条每日自动任务
