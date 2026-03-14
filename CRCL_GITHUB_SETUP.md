# CRCL GitHub Actions 部署说明

这个文件只针对 `Circle / CRCL` 监控系统。

## 这套自动化会做什么

GitHub Actions 每天自动运行：

- [crcl_notifier.ps1](/C:/Users/T14s/Documents/New%20project/crcl_notifier.ps1)
- [crcl_notifier.mjs](/C:/Users/T14s/Documents/New%20project/crcl_notifier.mjs)

它会：

1. 抓取 `CRCL / BTC / USDC / T-Bill / 恐惧贪婪 / 新闻`
2. 生成 `CRCL` 每日报告
3. 生成过去 12 个月图表
4. 推送到飞书机器人
5. 把产物保存成 GitHub Actions artifact

## 已经准备好的文件

- GitHub Actions 工作流：
  [.github/workflows/crcl-daily.yml](/C:/Users/T14s/Documents/New%20project/.github/workflows/crcl-daily.yml)

## 你需要在 GitHub 上做的事

### 1. 创建 GitHub 仓库

在 GitHub 新建一个 repo，例如：

- `crcl-monitor`

### 2. 把本地项目推上去

如果你没有用过 Git，可以按下面最短步骤走。

在项目目录打开 PowerShell，依次运行：

```powershell
git init
git add .
git commit -m "Initial CRCL and rational systems setup"
git branch -M main
git remote add origin https://github.com/你的用户名/你的仓库名.git
git push -u origin main
```

如果 GitHub 要求登录，按浏览器提示完成即可。

### 3. 在 GitHub 仓库里设置 Secrets

打开仓库：

`Settings -> Secrets and variables -> Actions -> New repository secret`

依次新增这 3 个 secret：

- `FEISHU_WEBHOOK_URL`
- `FEISHU_APP_ID`
- `FEISHU_APP_SECRET`

### 4. 手动试跑一次

打开：

`Actions -> CRCL Daily Monitor -> Run workflow`

看是否成功生成：

- `.state/crcl/latest_report.json`
- `.state/crcl/latest_report_chart.png`

并确认飞书是否收到消息。

## 定时说明

工作流现在的 cron 是：

```text
5 0 * * *
```

它对应北京时间每天：

- `08:05`

如果你想改时间，我可以继续帮你改。

## 重要说明

- 这套工作流只跑 `CRCL`，不会碰“理性投资系统”
- `CRCL` 状态目录是独立的：
  [.state/crcl](/C:/Users/T14s/Documents/New%20project/.state/crcl)
- 如果飞书图片仍然不显示，优先检查飞书应用权限是否真的生效
