import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const BASE_DIR = process.cwd();
const CONFIG_DIR = path.join(BASE_DIR, "config");
const STATE_DIR = path.join(BASE_DIR, ".state");
const REPORT_FILE = path.join(STATE_DIR, "latest_report.json");
const ENV_FILE = path.join(BASE_DIR, ".env");
const USER_AGENT = "Mozilla/5.0 (compatible; RationalInvestorBot/1.0)";
const TZ = "Asia/Shanghai";

const DEFAULT_PHILOSOPHY = `# 理性投资系统

## 核心原则
1. 牛股潜力：长期天花板高 + 短期高增长。做简单、高胜率的事。
2. 市场信号：
   - 见底：先阴跌再急跌，基本面最硬的股票暴跌。
   - 见顶：指标票暴涨、三四流股票扩散炒作。
3. 卖出规则：
   - 重大变化马上卖出。
   - 风险无法把控时果断卖出。
   - 多转空：不想加仓往往就是该空的时候。
   - 顺风期充分被认知也应减仓。
4. 公司治理与资本运作：
   - 管理层增持：熊市末期或基本面拐点是高置信度信号。
   - 大额回购：若注销回购，明显加分；若主要用于激励，权重减半。
   - 减持增发：高位减持、无理由增发配股是危险信号。
   - 并购叙事：关注协同，警惕掩盖主业放缓。
5. 熊牛判断：牛市=利空不跌；熊市=利好不涨。
6. 中美差异：中国关注国家意志；美国关注资本效率与企业主义。
7. 买入原则：
   - 估值低、基本面向上。
   - 暴跌超15%且出现流动性风险时，次日或收盘建仓。
8. 仓位管理：优先做 Rebalance，避免沉迷择时。
9. 行业逻辑：
   - 游戏传媒：产品周期，二阶导不行坚定走。
   - 互联网：利润周期 + 便宜 + 创新 + 反转 + 概念。
   - 制造电子：利润爆发。
10. 大忌：恐慌踩踏卖出，杠杆 FOMO。`;

const DEFAULT_SETTINGS = {
  reportName: "理性投资系统日报",
  timezone: TZ,
  maxNewsPerTicker: 3,
  benchmarkSymbols: {
    us: "^GSPC",
    china: "000001.SS",
    hongkong: "^HSI",
  },
};

const DEFAULT_WATCHLIST = [
  { ticker: "0700.HK", name: "腾讯控股", sector: "互联网/科技 (中国)", market: "hongkong", enabled: true },
  { ticker: "AAPL", name: "Apple", sector: "互联网/科技 (美国)", market: "us", enabled: true },
  { ticker: "NVDA", name: "NVIDIA", sector: "制造/电子", market: "us", enabled: true },
];

const DEFAULT_COMPANY_PROFILES = {
  "0700.HK": {
    thesis: "核心资产，现金流强，游戏与广告恢复、视频号商业化和 AI 布局是中期叙事。",
    longCeiling: "high",
    shortGrowth: "medium",
    valuation: "reasonable",
    businessMomentum: "improving",
    governance: "strong",
    capitalOperations: "positive",
    narrativeStrength: "strong",
    macroFit: "aligned",
    keyCatalysts: ["游戏新品周期", "广告恢复", "视频号与 AI 变现"],
    keyRisks: ["监管变化", "游戏流水不及预期", "互联网风险偏好回落"],
    hardChangeCheck: "no",
    notes: "如果基本面没有显著恶化，优先把回调看作波动而不是结构坏掉。"
  },
  "AAPL": {
    thesis: "高质量平台型公司，生态壁垒强，但增长斜率放缓，需要观察创新周期与估值匹配。",
    longCeiling: "medium",
    shortGrowth: "weak",
    valuation: "expensive",
    businessMomentum: "stable",
    governance: "strong",
    capitalOperations: "positive",
    narrativeStrength: "medium",
    macroFit: "aligned",
    keyCatalysts: ["新硬件周期", "服务业务增长", "AI 终端升级"],
    keyRisks: ["估值偏贵", "创新周期不足", "需求放缓"],
    hardChangeCheck: "no",
    notes: "更像防守核心资产，不适合在高估值时激进追价。"
  },
  "NVDA": {
    thesis: "AI 算力核心受益者，长期天花板高，但市场预期已高，买点比结论更重要。",
    longCeiling: "high",
    shortGrowth: "high",
    valuation: "expensive",
    businessMomentum: "strong",
    governance: "strong",
    capitalOperations: "neutral",
    narrativeStrength: "strong",
    macroFit: "aligned",
    keyCatalysts: ["AI 资本开支延续", "产品迭代", "云厂商订单"],
    keyRisks: ["高预期回落", "竞争加剧", "供应链波动"],
    hardChangeCheck: "no",
    notes: "属于高景气高预期品种，适合等信号确认后分批。"
  }
};

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function round(value, digits = 2) {
  if (value == null || Number.isNaN(value)) return null;
  return Number(value.toFixed(digits));
}

function signed(value, digits = 2, suffix = "") {
  if (value == null || Number.isNaN(value)) return "N/A";
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}${suffix}`;
}

function pct(value, digits = 2) {
  if (value == null || Number.isNaN(value)) return "N/A";
  return signed(value * 100, digits, "%");
}

function fmtPrice(value) {
  if (value == null || Number.isNaN(value)) return "N/A";
  return `$${value.toFixed(value >= 100 ? 1 : 2)}`;
}

function isBrokenText(value) {
  if (typeof value !== "string" || !value.trim()) return true;
  return /\?{2,}|�/.test(value);
}

function scorePhrase(value, mapping, fallback) {
  return mapping[value] || fallback;
}

function buildFallbackThesis(name, sector, profile) {
  const growth = scorePhrase(
    profile?.shortGrowth,
    { high: "短期增长兑现较快", medium: "短期增长在跟踪期", weak: "短期增长偏弱", negative: "短期增长承压" },
    "短期增长仍需确认",
  );
  const valuation = scorePhrase(
    profile?.valuation,
    { cheap: "估值偏低", reasonable: "估值大致合理", expensive: "估值偏贵", bubble: "估值明显透支" },
    "估值需要继续判断",
  );
  const momentum = scorePhrase(
    profile?.businessMomentum,
    { strong: "基本面趋势强", improving: "基本面在改善", stable: "基本面相对稳定", weakening: "基本面边际走弱", deteriorating: "基本面明显恶化" },
    "基本面趋势待跟踪",
  );

  if ((sector || "").includes("互联网/科技")) {
    return `${name} 当前更适合按平台能力、创新节奏和盈利质量来跟踪，${growth}，${valuation}，${momentum}。`;
  }
  if ((sector || "").includes("游戏") || (sector || "").includes("传媒")) {
    return `${name} 当前更适合按产品周期、用户活跃和内容变现来判断，${growth}，${valuation}，${momentum}。`;
  }
  if ((sector || "").includes("制造") || (sector || "").includes("电子")) {
    return `${name} 当前更适合按产业周期、产能利用率和利润弹性来观察，${growth}，${valuation}，${momentum}。`;
  }
  if ((sector || "").includes("大消费")) {
    return `${name} 当前更适合按品牌力、需求景气和经营效率来跟踪，${growth}，${valuation}，${momentum}。`;
  }
  if ((sector || "").includes("加密货币") || (sector || "").includes("Web3")) {
    return `${name} 当前更适合按监管进展、行业渗透和市场风险偏好来观察，${growth}，${valuation}，${momentum}。`;
  }
  return `${name} 当前更适合按长期空间、短期增长和估值匹配度来跟踪，${growth}，${valuation}，${momentum}。`;
}

function formatDate(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((item) => item.type === "year")?.value;
  const month = parts.find((item) => item.type === "month")?.value;
  const day = parts.find((item) => item.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

function formatDateTime(date) {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const year = parts.find((item) => item.type === "year")?.value;
  const month = parts.find((item) => item.type === "month")?.value;
  const day = parts.find((item) => item.type === "day")?.value;
  const hour = parts.find((item) => item.type === "hour")?.value;
  const minute = parts.find((item) => item.type === "minute")?.value;
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

async function readText(file, fallback) {
  try {
    return await fs.readFile(file, "utf8");
  } catch {
    return fallback;
  }
}

async function loadDotEnv() {
  const content = await readText(ENV_FILE, "");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index <= 0) continue;
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

async function ensureDefaults() {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
  await fs.mkdir(STATE_DIR, { recursive: true });

  const settingsPath = path.join(CONFIG_DIR, "settings.json");
  const watchlistPath = path.join(CONFIG_DIR, "watchlist.json");
  const philosophyPath = path.join(CONFIG_DIR, "philosophy.md");
  const feedbackPath = path.join(CONFIG_DIR, "feedback_inbox.md");
  const companyProfilesPath = path.join(CONFIG_DIR, "company_profiles.json");

  try {
    await fs.access(settingsPath);
  } catch {
    await fs.writeFile(settingsPath, `${JSON.stringify(DEFAULT_SETTINGS, null, 2)}\n`, "utf8");
  }

  try {
    await fs.access(watchlistPath);
  } catch {
    await fs.writeFile(watchlistPath, `${JSON.stringify(DEFAULT_WATCHLIST, null, 2)}\n`, "utf8");
  }

  try {
    await fs.access(philosophyPath);
  } catch {
    await fs.writeFile(philosophyPath, `${DEFAULT_PHILOSOPHY}\n`, "utf8");
  }

  try {
    await fs.access(feedbackPath);
  } catch {
    await fs.writeFile(
      feedbackPath,
      "# 心得增量收件箱\n\n- 把你未来在飞书或 Codex 想补充的心得记在这里，我后续可以继续整理进主规则库。\n",
      "utf8",
    );
  }

  try {
    await fs.access(companyProfilesPath);
  } catch {
    await fs.writeFile(companyProfilesPath, `${JSON.stringify(DEFAULT_COMPANY_PROFILES, null, 2)}\n`, "utf8");
  }
}

async function loadConfig() {
  await ensureDefaults();
  const settings = await readJson(path.join(CONFIG_DIR, "settings.json"), DEFAULT_SETTINGS);
  const watchlist = await readJson(path.join(CONFIG_DIR, "watchlist.json"), DEFAULT_WATCHLIST);
  const philosophy = await readText(path.join(CONFIG_DIR, "philosophy.md"), DEFAULT_PHILOSOPHY);
  const feedbackInbox = await readText(path.join(CONFIG_DIR, "feedback_inbox.md"), "");
  const companyProfiles = await readJson(path.join(CONFIG_DIR, "company_profiles.json"), DEFAULT_COMPANY_PROFILES);

  return {
    settings: { ...DEFAULT_SETTINGS, ...settings },
    watchlist: (watchlist || []).filter((item) => item && item.enabled !== false),
    philosophy,
    feedbackInbox,
    companyProfiles: companyProfiles || DEFAULT_COMPANY_PROFILES,
  };
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json, text/plain, */*",
    },
  });
  if (!response.ok) throw new Error(`Fetch failed ${response.status}: ${url}`);
  return response.json();
}

function parseYahooChart(payload) {
  const result = payload?.chart?.result?.[0];
  if (!result) return [];
  const timestamps = result.timestamp || [];
  const quote = result.indicators?.quote?.[0] || {};

  return timestamps
    .map((timestamp, index) => ({
      date: formatDate(new Date(timestamp * 1000)),
      open: quote.open?.[index] ?? null,
      high: quote.high?.[index] ?? null,
      low: quote.low?.[index] ?? null,
      close: quote.close?.[index] ?? null,
      volume: quote.volume?.[index] ?? null,
    }))
    .filter((point) => point.close != null && point.high != null && point.low != null);
}

async function fetchYahooSeries(symbol, range = "6mo") {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=${range}&includePrePost=false&events=div%2Csplits`;
  return parseYahooChart(await fetchJson(url));
}

function sma(values, period) {
  return values.map((_, index) => {
    if (index + 1 < period) return null;
    const slice = values.slice(index - period + 1, index + 1);
    if (slice.some((value) => value == null)) return null;
    return slice.reduce((sum, value) => sum + value, 0) / period;
  });
}

function ema(values, period) {
  const multiplier = 2 / (period + 1);
  const result = [];
  let previous = null;
  for (const value of values) {
    if (value == null) {
      result.push(null);
      continue;
    }
    previous = previous == null ? value : (value - previous) * multiplier + previous;
    result.push(previous);
  }
  return result;
}

function std(values, period) {
  return values.map((_, index) => {
    if (index + 1 < period) return null;
    const slice = values.slice(index - period + 1, index + 1);
    if (slice.some((value) => value == null)) return null;
    const avg = slice.reduce((sum, value) => sum + value, 0) / period;
    const variance = slice.reduce((sum, value) => sum + (value - avg) ** 2, 0) / period;
    return Math.sqrt(variance);
  });
}

function buildIndicators(series) {
  const closes = series.map((item) => item.close);
  const highs = series.map((item) => item.high);
  const lows = series.map((item) => item.low);
  const volumes = series.map((item) => item.volume);

  const ma5 = sma(closes, 5);
  const ma20 = sma(closes, 20);
  const ma60 = sma(closes, 60);
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const dif = ema12.map((value, index) => (value == null || ema26[index] == null ? null : value - ema26[index]));
  const dea = ema(dif, 9);
  const hist = dif.map((value, index) => (value == null || dea[index] == null ? null : (value - dea[index]) * 2));

  const gains = [null];
  const losses = [null];
  for (let index = 1; index < closes.length; index += 1) {
    const change = closes[index] - closes[index - 1];
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? Math.abs(change) : 0);
  }
  const avgGain = sma(gains, 14);
  const avgLoss = sma(losses, 14);
  const rsi14 = avgGain.map((gain, index) => {
    const loss = avgLoss[index];
    if (gain == null || loss == null) return null;
    if (loss === 0) return 100;
    const rs = gain / loss;
    return 100 - 100 / (1 + rs);
  });

  const mid = sma(closes, 20);
  const deviation = std(closes, 20);
  const bollUpper = mid.map((value, index) => (value == null || deviation[index] == null ? null : value + deviation[index] * 2));
  const bollLower = mid.map((value, index) => (value == null || deviation[index] == null ? null : value - deviation[index] * 2));

  const k = [];
  const d = [];
  const j = [];
  let prevK = 50;
  let prevD = 50;
  for (let index = 0; index < closes.length; index += 1) {
    if (index + 1 < 9) {
      k.push(null);
      d.push(null);
      j.push(null);
      continue;
    }
    const high9 = Math.max(...highs.slice(index - 8, index + 1));
    const low9 = Math.min(...lows.slice(index - 8, index + 1));
    const rsv = high9 === low9 ? 50 : ((closes[index] - low9) / (high9 - low9)) * 100;
    const currentK = (2 / 3) * prevK + (1 / 3) * rsv;
    const currentD = (2 / 3) * prevD + (1 / 3) * currentK;
    const currentJ = 3 * currentK - 2 * currentD;
    prevK = currentK;
    prevD = currentD;
    k.push(currentK);
    d.push(currentD);
    j.push(currentJ);
  }

  const volume20 = sma(volumes, 20);

  return series.map((item, index) => ({
    ...item,
    ma5: ma5[index],
    ma20: ma20[index],
    ma60: ma60[index],
    macd: { dif: dif[index], dea: dea[index], hist: hist[index] },
    rsi14: rsi14[index],
    boll: { mid: mid[index], upper: bollUpper[index], lower: bollLower[index] },
    kdj: { k: k[index], d: d[index], j: j[index] },
    volume20: volume20[index],
  }));
}

function describeMarket(score) {
  if (score >= 70) return "偏强";
  if (score >= 55) return "中性偏强";
  if (score >= 45) return "中性";
  if (score >= 30) return "中性偏弱";
  return "偏弱";
}

function analyzeBenchmark(series) {
  const enriched = buildIndicators(series);
  const latest = enriched.at(-1);
  if (!latest) return { score: 50, label: "中性" };
  let score = 50;
  if (latest.close > latest.ma20) score += 8;
  if (latest.ma20 > latest.ma60) score += 7;
  if ((latest.macd.hist || 0) > 0) score += 6;
  if ((latest.rsi14 || 50) > 60) score += 4;
  if ((latest.rsi14 || 50) < 40) score -= 6;
  return { score: clamp(score, 0, 100), label: describeMarket(clamp(score, 0, 100)) };
}

function scoreBand(value, mapping, fallback = 0) {
  return mapping[value] ?? fallback;
}

function analyzeCompanyProfile(profile) {
  const factors = [];
  const warnings = [];
  let score = 50;

  const longCeilingScore = scoreBand(profile?.longCeiling, { high: 10, medium: 4, low: -5 });
  score += longCeilingScore;
  if (longCeilingScore > 0) factors.push("长期天花板仍具备空间");
  if (longCeilingScore < 0) warnings.push("长期空间有限");

  const shortGrowthScore = scoreBand(profile?.shortGrowth, { high: 10, medium: 4, weak: -6, negative: -10 });
  score += shortGrowthScore;
  if (shortGrowthScore > 0) factors.push("短期增长或景气度在兑现");
  if (shortGrowthScore < 0) warnings.push("短期增长斜率偏弱");

  const valuationScore = scoreBand(profile?.valuation, { cheap: 10, reasonable: 4, expensive: -8, bubble: -14 });
  score += valuationScore;
  if (valuationScore > 0) factors.push("估值与基本面匹配度较好");
  if (valuationScore < 0) warnings.push("估值偏贵，买点要求更高");

  const businessMomentumScore = scoreBand(profile?.businessMomentum, { strong: 10, improving: 7, stable: 2, weakening: -8, deteriorating: -14 });
  score += businessMomentumScore;
  if (businessMomentumScore > 0) factors.push("基本面边际改善或保持强势");
  if (businessMomentumScore < 0) warnings.push("基本面趋势走弱");

  const governanceScore = scoreBand(profile?.governance, { strong: 7, normal: 0, weak: -10 });
  score += governanceScore;
  if (governanceScore > 0) factors.push("公司治理质量较高");
  if (governanceScore < 0) warnings.push("公司治理存在疑点");

  const capitalOpsScore = scoreBand(profile?.capitalOperations, { positive: 8, neutral: 0, negative: -12 });
  score += capitalOpsScore;
  if (capitalOpsScore > 0) factors.push("资本运作偏正面");
  if (capitalOpsScore < 0) warnings.push("资本运作偏负面");

  const narrativeScore = scoreBand(profile?.narrativeStrength, { strong: 7, medium: 2, weak: -6 });
  score += narrativeScore;
  if (narrativeScore > 0) factors.push("中长期叙事仍成立");
  if (narrativeScore < 0) warnings.push("叙事支撑不足");

  const macroFitScore = scoreBand(profile?.macroFit, { aligned: 5, mixed: 0, misaligned: -8 });
  score += macroFitScore;
  if (macroFitScore > 0) factors.push("与当前市场风格匹配");
  if (macroFitScore < 0) warnings.push("与当前市场风格不匹配");

  if ((profile?.hardChangeCheck || "no") === "yes") {
    score -= 25;
    warnings.push("出现重大变化，优先降级处理");
  }

  return {
    score: clamp(score, 0, 100),
    factors,
    warnings,
  };
}

function recentChange(series, lag = 1) {
  if (series.length <= lag) return null;
  const latest = series.at(-1)?.close;
  const previous = series.at(-1 - lag)?.close;
  if (latest == null || previous == null || previous === 0) return null;
  return latest / previous - 1;
}

function maxClose(series, lookback) {
  const slice = series.slice(-lookback);
  return Math.max(...slice.map((item) => item.close));
}

function minClose(series, lookback) {
  const slice = series.slice(-lookback);
  return Math.min(...slice.map((item) => item.close));
}

function buildQa(item, benchmark, profile) {
  const latest = item.series.at(-1);
  const high60 = maxClose(item.series, Math.min(60, item.series.length));
  const drawdown = high60 ? latest.close / high60 - 1 : null;
  const questions = [
    {
      question: "趋势是否站上中期均线？",
      answer: latest.close > latest.ma20 && latest.ma20 > latest.ma60 ? "是" : "否",
      note: `收盘 ${fmtPrice(latest.close)}，MA20 ${fmtPrice(latest.ma20)}，MA60 ${fmtPrice(latest.ma60)}`,
    },
    {
      question: "技术指标是否出现共振？",
      answer: (latest.macd.hist || 0) > 0 && (latest.rsi14 || 0) >= 45 && (latest.kdj.k || 0) >= (latest.kdj.d || 0) ? "是" : "否",
      note: `MACD柱 ${signed(latest.macd.hist || 0, 2)}，RSI14 ${(latest.rsi14 || 0).toFixed(1)}`,
    },
    {
      question: "是否出现你偏好的“恐慌性下跌后观察买点”？",
      answer: drawdown != null && drawdown <= -0.15 && (latest.rsi14 || 100) < 38 ? "是" : "否",
      note: `距60日高点 ${pct(drawdown || 0)}，RSI14 ${(latest.rsi14 || 0).toFixed(1)}`,
    },
    {
      question: "是否触发风险退出信号？",
      answer: latest.close < latest.ma20 && (latest.macd.hist || 0) < 0 && (latest.rsi14 || 100) < 42 ? "是" : "否",
      note: "跌破均线且动量转负时优先保护资金",
    },
    {
      question: "市场环境是否支持？",
      answer: benchmark.score >= 55 ? "是" : "否",
      note: `对应市场风格：${benchmark.label} (${benchmark.score})`,
    },
    {
      question: "公司基本面与叙事是否仍成立？",
      answer:
        ((profile?.businessMomentum === "strong" || profile?.businessMomentum === "improving" || profile?.narrativeStrength === "strong") &&
          (profile?.hardChangeCheck || "no") !== "yes")
          ? "是"
          : "否",
      note: profile?.thesis || "尚未补充公司画像，请维护 company_profiles.json",
    },
  ];
  return questions;
}

function analyzeTicker(entry, benchmark, profile) {
  const series = buildIndicators(entry.rawSeries);
  const latest = series.at(-1);
  const previous = series.at(-2) || latest;
  if (!latest) throw new Error(`No data for ${entry.ticker}`);

  const thesis = isBrokenText(profile?.thesis) ? buildFallbackThesis(entry.name, entry.sector, profile) : profile?.thesis;

  const qualitative = analyzeCompanyProfile(profile);
  let score = qualitative.score;
  const factors = [...qualitative.factors];
  const warnings = [...qualitative.warnings];

  if (latest.close > latest.ma20) {
    score += 8;
    factors.push("价格站上 MA20");
  } else {
    score -= 8;
    warnings.push("价格跌破 MA20");
  }

  if (latest.ma20 > latest.ma60) {
    score += 8;
    factors.push("MA20 位于 MA60 上方，中期结构偏多");
  } else {
    score -= 8;
    warnings.push("MA20 仍弱于 MA60");
  }

  if ((latest.macd.hist || 0) > 0) {
    score += 7;
    factors.push("MACD 柱体转正，动量改善");
  } else {
    score -= 7;
    warnings.push("MACD 柱体为负，动量承压");
  }

  if ((latest.kdj.k || 0) >= (latest.kdj.d || 0)) {
    score += 5;
    factors.push("KDJ 保持金叉或强势钝化");
  } else {
    score -= 5;
    warnings.push("KDJ 死叉，短线弹性转弱");
  }

  if ((latest.rsi14 || 50) >= 48 && (latest.rsi14 || 50) <= 68) {
    score += 6;
    factors.push("RSI 位于健康强势区间");
  } else if ((latest.rsi14 || 50) < 35) {
    score += 3;
    factors.push("RSI 偏低，接近你偏好的恐慌观察区");
  } else if ((latest.rsi14 || 50) > 76) {
    score -= 8;
    warnings.push("RSI 偏热，注意顺风期减仓");
  }

  const oneDay = previous.close ? latest.close / previous.close - 1 : null;
  const volumeRatio = latest.volume20 ? latest.volume / latest.volume20 : null;
  if (oneDay != null && oneDay > 0.02 && (volumeRatio || 0) > 1.2) {
    score += 6;
    factors.push("放量上涨，资金承接较好");
  }
  if (oneDay != null && oneDay < -0.03 && (volumeRatio || 0) > 1.3) {
    score -= 7;
    warnings.push("放量下跌，说明筹码松动");
  }

  const high60 = maxClose(series, Math.min(60, series.length));
  const low60 = minClose(series, Math.min(60, series.length));
  const drawdown60 = high60 ? latest.close / high60 - 1 : null;
  const reboundFromLow = low60 ? latest.close / low60 - 1 : null;

  if (drawdown60 != null && drawdown60 <= -0.15 && (latest.rsi14 || 100) < 38) {
    score += 7;
    factors.push("符合“暴跌超15%后观察建仓”的心得条件");
  }

  if (reboundFromLow != null && reboundFromLow > 0.25 && (latest.rsi14 || 0) > 72) {
    score -= 6;
    warnings.push("低位反弹幅度已大，追高性价比下降");
  }

  if (benchmark.score >= 60) {
    score += 3;
    factors.push(`市场环境 ${benchmark.label}，对多头更友好`);
  } else if (benchmark.score <= 40) {
    score -= 3;
    warnings.push(`市场环境 ${benchmark.label}，追涨风险更高`);
  }

  score = clamp(score, 0, 100);

  let decision = "WAIT";
  if ((profile?.hardChangeCheck || "no") === "yes") decision = "SELL";
  else if (score >= 80) decision = "BUY";
  else if (score >= 56) decision = "HOLD";
  else if (score <= 38) decision = "SELL";
  else decision = "WAIT";

  const confidence = clamp(Math.round(Math.abs(score - 50) * 2), 35, 95);
  const summaryMap = {
    BUY: "技术面出现较完整共振，可考虑分批买入或调高观察级别。",
    HOLD: "结构没有破坏，继续持有并观察关键均线与量价配合。",
    WAIT: "信号不够统一，先观望，避免情绪化操作。",
    SELL: "风险信号占优，更符合先保护资金、再等待下一轮机会。",
  };

  return {
    ticker: entry.ticker,
    name: entry.name,
    sector: entry.sector,
    market: entry.market,
    decision,
    confidence,
    summary: summaryMap[decision],
    score,
    price: round(latest.close, 2),
    change1d: round(oneDay, 4),
    change5d: round(recentChange(series, 5), 4),
    benchmark: benchmark.label,
    thesis: thesis || "未配置公司画像",
    questions: buildQa({ ...entry, series }, benchmark, profile),
    technical: {
      ma5: round(latest.ma5, 2),
      ma20: round(latest.ma20, 2),
      ma60: round(latest.ma60, 2),
      rsi14: round(latest.rsi14, 2),
      macdHist: round(latest.macd.hist, 3),
      k: round(latest.kdj.k, 2),
      d: round(latest.kdj.d, 2),
      bollUpper: round(latest.boll.upper, 2),
      bollLower: round(latest.boll.lower, 2),
      volumeRatio: round(volumeRatio, 2),
      drawdown60: round(drawdown60, 4),
    },
    keyFactors: factors.slice(0, 5),
    warnings: warnings.slice(0, 4),
    qualitative: {
      longCeiling: profile?.longCeiling || "unknown",
      shortGrowth: profile?.shortGrowth || "unknown",
      valuation: profile?.valuation || "unknown",
      businessMomentum: profile?.businessMomentum || "unknown",
      governance: profile?.governance || "unknown",
      capitalOperations: profile?.capitalOperations || "unknown",
      narrativeStrength: profile?.narrativeStrength || "unknown",
      hardChangeCheck: profile?.hardChangeCheck || "no",
      catalysts: profile?.keyCatalysts || [],
      risks: profile?.keyRisks || [],
      notes: profile?.notes || "",
    },
    series: series.slice(-90).map((point) => ({
      date: point.date,
      close: round(point.close, 2),
      ma20: round(point.ma20, 2),
      ma60: round(point.ma60, 2),
      rsi14: round(point.rsi14, 2),
      macdHist: round(point.macd.hist, 3),
    })),
  };
}

function decisionLabel(decision) {
  return {
    BUY: "🟢【买入】",
    HOLD: "🟡【持有】",
    WAIT: "⚪【观望】",
    SELL: "🔴【卖出】",
  }[decision] || decision;
}

function buildSummary(results) {
  const counts = { BUY: 0, HOLD: 0, WAIT: 0, SELL: 0 };
  for (const item of results) counts[item.decision] += 1;
  return {
    buyCount: counts.BUY,
    holdCount: counts.HOLD,
    waitCount: counts.WAIT,
    sellCount: counts.SELL,
  };
}

function decisionRank(decision) {
  return {
    BUY: 0,
    SELL: 1,
    HOLD: 2,
    WAIT: 3,
  }[decision] ?? 9;
}

function buildMarkdown(report) {
  const lines = [
    `${report.reportName} | ${report.date}`,
    "",
    `生成时间：${report.generatedAt}`,
    `覆盖标的：${report.summary.total} 只`,
    `市场概览：美股 ${report.benchmarks.us.label} / 港股 ${report.benchmarks.hongkong.label} / A股 ${report.benchmarks.china.label}`,
    `今日分布：买入 ${report.summary.buyCount} | 卖出 ${report.summary.sellCount} | 持有 ${report.summary.holdCount} | 观望 ${report.summary.waitCount}`,
    "",
    "逐股结论",
  ];

  for (const item of report.decisions) {
    lines.push(
      `- ${decisionLabel(item.decision)} ${item.ticker} ${item.name} | 置信度 ${item.confidence}% | 现价 ${fmtPrice(item.price)} | 1日 ${pct(item.change1d)} | 5日 ${pct(item.change5d)}`,
      `  公司判断：${item.thesis}`,
      `  结论：${item.summary}`,
      `  因素：${item.keyFactors.join("；") || "暂无"}`,
      `  风险：${item.warnings.join("；") || "暂无"}`,
    );
  }

  lines.push("", "系统提醒");
  lines.push("- 飞书机器人当前仅负责主动推送；若要把飞书回复自动写回心得库，需要接入飞书事件回调服务。");
  lines.push("- 当前版本已经改成“公司画像 + 心得规则”为主，技术指标为辅助确认；请持续维护 company_profiles.json。");
  lines.push("", "你可以直接这样回复我");
  lines.push("心得：这里写你今天新增的一条投资心得");
  lines.push("加入自选股：TSM | 台积电 | 制造/电子 | us");
  lines.push("移除自选股：AAPL");
  lines.push("更新公司：0700.HK | 逻辑=这里写公司逻辑 | 基本面=improving | 估值=reasonable | 催化剂=视频号变现,游戏新品");
  lines.push("公司knowhow：0700.HK | 逻辑=这里写你对公司的最新理解 | 催化剂=这里写催化剂 | 风险=这里写风险 | 备注=这里写经验判断");
  lines.push("公司knowhow：0700.HK | 这里也可以直接自由表达，我会记录并自动归纳到公司画像");
  lines.push("帮助：");
  return lines.join("\n");
}

async function sendFeishu(text) {
  const webhook = process.env.FEISHU_WEBHOOK_URL;
  if (!webhook) return false;

  const response = await fetch(webhook, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "User-Agent": USER_AGENT,
    },
    body: JSON.stringify({
      msg_type: "text",
      content: { text },
    }),
  });

  if (!response.ok) throw new Error(`Feishu push failed ${response.status}`);
  return true;
}

async function buildReport() {
  const config = await loadConfig();
  const benchmarkSymbols = config.settings.benchmarkSymbols || DEFAULT_SETTINGS.benchmarkSymbols;

  const [usBenchmarkRaw, hkBenchmarkRaw, cnBenchmarkRaw, ...watchlistData] = await Promise.all([
    fetchYahooSeries(benchmarkSymbols.us, "6mo"),
    fetchYahooSeries(benchmarkSymbols.hongkong, "6mo"),
    fetchYahooSeries(benchmarkSymbols.china, "6mo"),
    ...config.watchlist.map((item) => fetchYahooSeries(item.ticker, "6mo")),
  ]);

  const benchmarks = {
    us: analyzeBenchmark(usBenchmarkRaw),
    hongkong: analyzeBenchmark(hkBenchmarkRaw),
    china: analyzeBenchmark(cnBenchmarkRaw),
  };

  const decisions = config.watchlist.map((item, index) =>
    analyzeTicker(
      {
        ...item,
        rawSeries: watchlistData[index],
      },
      benchmarks[item.market] || benchmarks.us,
      config.companyProfiles[item.ticker],
    ),
  );

  decisions.sort((a, b) => {
    const rankDiff = decisionRank(a.decision) - decisionRank(b.decision);
    if (rankDiff !== 0) return rankDiff;
    return b.score - a.score;
  });
  const summary = buildSummary(decisions);

  return {
    reportName: config.settings.reportName || DEFAULT_SETTINGS.reportName,
    date: formatDate(new Date()),
    generatedAt: formatDateTime(new Date()),
    philosophy,
    feedbackInbox: config.feedbackInbox,
    watchlist: config.watchlist,
    benchmarks,
    decisions,
    summary: {
      ...summary,
      total: decisions.length,
    },
    meta: {
      philosophyPath: path.join(CONFIG_DIR, "philosophy.md"),
      watchlistPath: path.join(CONFIG_DIR, "watchlist.json"),
      feedbackInboxPath: path.join(CONFIG_DIR, "feedback_inbox.md"),
      companyProfilesPath: path.join(CONFIG_DIR, "company_profiles.json"),
    },
  };
}

let philosophy = DEFAULT_PHILOSOPHY;

async function main() {
  await loadDotEnv();
  const config = await loadConfig();
  philosophy = config.philosophy;
  const report = await buildReport();
  const markdown = buildMarkdown(report);
  await fs.writeFile(REPORT_FILE, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(markdown);
  const pushed = await sendFeishu(markdown).catch(() => false);
  console.log(pushed ? "\nFeishu 推送成功。" : "\n未执行飞书推送：请检查 FEISHU_WEBHOOK_URL 是否已配置。");
}

main().catch((error) => {
  console.error(String(error));
  process.exitCode = 1;
});
