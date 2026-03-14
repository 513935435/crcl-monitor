const state = {
  report: window.sampleReport,
};

function byId(id) {
  return document.getElementById(id);
}

function decisionLabel(decision) {
  return {
    BUY: "买入",
    HOLD: "持有",
    WAIT: "观望",
    SELL: "卖出",
  }[decision] || decision;
}

function pct(value, digits = 2) {
  if (value == null || Number.isNaN(value)) return "N/A";
  const sign = value > 0 ? "+" : "";
  return `${sign}${(value * 100).toFixed(digits)}%`;
}

function renderSummary(report) {
  byId("summary-cards").innerHTML = [
    ["今日买入", report.summary.buyCount],
    ["继续持有", report.summary.holdCount],
    ["继续观望", report.summary.waitCount],
    ["风险卖出", report.summary.sellCount],
  ]
    .map(
      ([label, value]) => `
        <article class="stat-card">
          <span>${label}</span>
          <strong>${value}</strong>
        </article>
      `,
    )
    .join("");

  byId("meta").textContent = `报告日期 ${report.date} | 生成时间 ${report.generatedAt}`;
  byId("market-bar").innerHTML = `
    <div><span>美股</span><strong>${report.benchmarks.us.label} (${report.benchmarks.us.score})</strong></div>
    <div><span>港股</span><strong>${report.benchmarks.hongkong.label} (${report.benchmarks.hongkong.score})</strong></div>
    <div><span>A股</span><strong>${report.benchmarks.china.label} (${report.benchmarks.china.score})</strong></div>
  `;
}

function renderDecisions(report) {
  byId("decision-table").innerHTML = report.decisions
    .map(
      (item) => `
        <article class="decision-card decision-${item.decision.toLowerCase()}">
          <div class="decision-head">
            <div>
              <h3>${item.ticker} <span>${item.name}</span></h3>
              <p>${item.sector} · ${item.benchmark}</p>
            </div>
            <div class="decision-badge">
              <strong>${decisionLabel(item.decision)}</strong>
              <small>置信度 ${item.confidence}%</small>
            </div>
          </div>

          <div class="decision-grid">
            <div>
              <span>现价</span>
              <strong>$${item.price}</strong>
            </div>
            <div>
              <span>1日变化</span>
              <strong>${pct(item.change1d)}</strong>
            </div>
            <div>
              <span>5日变化</span>
              <strong>${pct(item.change5d)}</strong>
            </div>
            <div>
              <span>系统分数</span>
              <strong>${item.score}</strong>
            </div>
          </div>

          <p class="decision-summary">${item.summary}</p>
          <p class="decision-summary"><strong>公司判断：</strong>${item.thesis || "未配置公司画像"}</p>

          <div class="chips">
            ${item.keyFactors.map((factor) => `<span class="chip chip-good">${factor}</span>`).join("")}
            ${item.warnings.map((warning) => `<span class="chip chip-risk">${warning}</span>`).join("")}
          </div>

          <div class="qa-block">
            ${item.questions
              .map(
                (qa) => `
                  <div class="qa-row">
                    <div>
                      <h4>${qa.question}</h4>
                      <p>${qa.note}</p>
                    </div>
                    <strong>${qa.answer}</strong>
                  </div>
                `,
              )
              .join("")}
          </div>

          <div class="metric-grid">
            <div><span>RSI14</span><strong>${item.technical.rsi14}</strong></div>
            <div><span>MACD Hist</span><strong>${item.technical.macdHist}</strong></div>
            <div><span>MA20</span><strong>${item.technical.ma20}</strong></div>
            <div><span>MA60</span><strong>${item.technical.ma60}</strong></div>
            <div><span>量比</span><strong>${item.technical.volumeRatio}</strong></div>
            <div><span>距60日高点</span><strong>${pct(item.technical.drawdown60)}</strong></div>
          </div>
        </article>
      `,
    )
    .join("");
}

function renderConfig(report) {
  byId("watchlist").innerHTML = report.watchlist
    .map((item) => `<li><strong>${item.ticker}</strong><span>${item.name} · ${item.sector}</span></li>`)
    .join("");

  byId("philosophy").textContent = report.philosophy;
  byId("feedback").textContent = report.feedbackInbox;
  byId("config-paths").innerHTML = `
    <li>${report.meta.philosophyPath}</li>
    <li>${report.meta.watchlistPath}</li>
    <li>${report.meta.feedbackInboxPath}</li>
    <li>${report.meta.companyProfilesPath}</li>
  `;
}

function render(report) {
  state.report = report;
  renderSummary(report);
  renderDecisions(report);
  renderConfig(report);
}

async function loadLatestReport() {
  try {
    const response = await fetch("./.state/latest_report.json", { cache: "no-store" });
    if (!response.ok) throw new Error("latest_report.json not found");
    const report = await response.json();
    render(report);
  } catch {
    render(window.sampleReport);
  }
}

loadLatestReport();
