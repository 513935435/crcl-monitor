import { execFile } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const BASE_DIR = process.cwd();
const STATE_DIR = path.join(BASE_DIR, ".state", "crcl");
const CACHE_DIR = path.join(STATE_DIR, "cache");
const REPORT_FILE = path.join(STATE_DIR, "latest_report.json");
const CHART_CSV_FILE = path.join(STATE_DIR, "latest_report_chart.csv");
const CHART_PNG_FILE = path.join(STATE_DIR, "latest_report_chart.png");
const USER_AGENT = "Mozilla/5.0 (compatible; CRCLMonitor/isolated-1.0)";
const TZ = "Asia/Shanghai";

function isPushEnabled() {
  const raw = `${process.env.CRCL_PUSH_ENABLED ?? "true"}`.trim().toLowerCase();
  return !["0", "false", "off", "no"].includes(raw);
}

const NEWS_QUERIES = [
  "Circle CRCL USDC stablecoin when:7d",
  "stablecoin regulation Circle Tether PYUSD when:7d",
  "Bitcoin crypto market risk sentiment when:7d",
  "GENIUS Act MiCA Circle USDC when:14d",
  "Circle CRCL analyst rating upgrade downgrade target price when:14d",
];

const NEWS_THEMES = {
  genius: {
    label: "GENIUS",
    category: "监管",
    weight: 1.9,
    keywords: ["genius act", "genius", "stablecoin bill", "senate bill", "house bill"],
    positive: ["advance", "passes", "approval", "support", "clearer rules", "momentum"],
    negative: ["delay", "blocked", "stalls", "pushback", "opposition"],
  },
  mica: {
    label: "MiCA",
    category: "监管",
    weight: 1.6,
    keywords: ["mica", "eu stablecoin", "european union", "euro area"],
    positive: ["license", "approval", "authorized", "compliant", "expands"],
    negative: ["restriction", "breach", "ban", "non-compliant", "investigation"],
  },
  competition: {
    label: "竞品稳定币",
    category: "竞争",
    weight: 1.75,
    keywords: ["tether", "usdt", "pyusd", "paypal usd", "fdusd", "usdg", "rlusd", "stablecoin rival"],
    positive: ["outflow", "depeg", "scrutiny", "share loss", "pressure"],
    negative: ["adoption", "growth", "integration", "market share gain", "expands"],
  },
  analyst: {
    label: "Analyst Rating",
    category: "分析师",
    weight: 1.7,
    keywords: ["analyst", "rating", "price target", "upgrade", "downgrade", "outperform", "underperform", "buy rating", "william blair", "jp morgan", "goldman"],
    positive: ["upgrade", "buy", "outperform", "overweight", "target raised", "initiates with buy"],
    negative: ["downgrade", "underperform", "sell", "underweight", "target cut", "cuts target"],
  },
};

const MODEL_LIBRARY = [
  { name: "balanced", smoothing: 0.38, weights: { btcMomentum: 0.25, btcAcceleration: 0.1, usdcGrowth: 0.24, usdcShare: 0.16, tbillInverse: 0.1, sentiment: 0.06, thematicNews: 0.09 } },
  { name: "crypto_beta", smoothing: 0.42, weights: { btcMomentum: 0.34, btcAcceleration: 0.18, usdcGrowth: 0.18, usdcShare: 0.1, tbillInverse: 0.06, sentiment: 0.06, thematicNews: 0.08 } },
  { name: "fundamental_macro", smoothing: 0.3, weights: { btcMomentum: 0.15, btcAcceleration: 0.07, usdcGrowth: 0.28, usdcShare: 0.18, tbillInverse: 0.16, sentiment: 0.06, thematicNews: 0.1 } },
];

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function mean(values) {
  const filtered = values.filter((value) => value != null && !Number.isNaN(value));
  return filtered.length ? filtered.reduce((sum, value) => sum + value, 0) / filtered.length : null;
}

function std(values) {
  const avg = mean(values);
  const filtered = values.filter((value) => value != null && !Number.isNaN(value));
  if (avg == null || filtered.length < 2) return null;
  const variance = filtered.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (filtered.length - 1);
  return Math.sqrt(variance);
}

function round(value, digits = 4) {
  if (value == null || Number.isNaN(value)) return null;
  return Number(value.toFixed(digits));
}

function signed(value, digits = 2, suffix = "") {
  if (value == null || Number.isNaN(value)) return "N/A";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}${suffix}`;
}

function pct(value, digits = 1) {
  if (value == null || Number.isNaN(value)) return "N/A";
  return signed(value * 100, digits, "%");
}

function money(value, digits = 2) {
  if (value == null || Number.isNaN(value)) return "N/A";
  if (Math.abs(value) >= 1e9) return `$${(value / 1e9).toFixed(digits)}B`;
  if (Math.abs(value) >= 1e6) return `$${(value / 1e6).toFixed(digits)}M`;
  return `$${value.toFixed(digits)}`;
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

function pctChange(values, lag) {
  return values.map((value, index) => {
    const prev = values[index - lag];
    if (value == null || prev == null || prev === 0) return null;
    return value / prev - 1;
  });
}

function diff(values, lag = 1) {
  return values.map((value, index) => {
    const prev = values[index - lag];
    if (value == null || prev == null) return null;
    return value - prev;
  });
}

function movingAverage(values, window) {
  return values.map((_, index) => {
    const start = Math.max(0, index - window + 1);
    const slice = values.slice(start, index + 1).filter((value) => value != null);
    return slice.length ? slice.reduce((sum, value) => sum + value, 0) / slice.length : null;
  });
}

function zscoreAt(values, index, window = 30) {
  const start = Math.max(0, index - window + 1);
  const slice = values.slice(start, index + 1);
  const avg = mean(slice);
  const deviation = std(slice);
  if (avg == null || !deviation || values[index] == null) return 0;
  return clamp((values[index] - avg) / deviation, -3, 3);
}

function pearson(x, y) {
  const pairs = [];
  for (let index = 0; index < Math.min(x.length, y.length); index += 1) {
    if (x[index] == null || y[index] == null || Number.isNaN(x[index]) || Number.isNaN(y[index])) continue;
    pairs.push([x[index], y[index]]);
  }
  if (pairs.length < 8) return null;
  const xs = pairs.map((pair) => pair[0]);
  const ys = pairs.map((pair) => pair[1]);
  const avgX = mean(xs);
  const avgY = mean(ys);
  const sdX = std(xs);
  const sdY = std(ys);
  if (!sdX || !sdY) return null;
  const covariance = pairs.reduce((sum, [a, b]) => sum + (a - avgX) * (b - avgY), 0) / (pairs.length - 1);
  return covariance / (sdX * sdY);
}

function cachePath(url, suffix) {
  const key = crypto.createHash("sha1").update(url).digest("hex");
  return path.join(CACHE_DIR, `${key}.${suffix}`);
}

async function readText(file) {
  try {
    return await fs.readFile(file, "utf8");
  } catch {
    return null;
  }
}

async function fetchWithCache(url, { accept, suffix, maxAgeMs = 6 * 60 * 60 * 1000 }) {
  const file = cachePath(url, suffix);
  try {
    const stat = await fs.stat(file);
    if (Date.now() - stat.mtimeMs <= maxAgeMs) {
      const cached = await readText(file);
      if (cached != null) return cached;
    }
  } catch {}

  try {
    const response = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: accept } });
    if (!response.ok) throw new Error(`Fetch failed ${response.status} for ${url}`);
    const text = await response.text();
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.writeFile(file, text, "utf8");
    return text;
  } catch (error) {
    const stale = await readText(file);
    if (stale != null) return stale;
    throw error;
  }
}

async function fetchJson(url) {
  return JSON.parse(await fetchWithCache(url, { accept: "application/json, text/plain, */*", suffix: "json" }));
}

async function fetchText(url) {
  return fetchWithCache(url, { accept: "text/plain, text/html, application/xml, */*", suffix: "txt" });
}

function parseYahooChart(payload) {
  const result = payload?.chart?.result?.[0];
  if (!result) return [];
  const timestamps = result.timestamp || [];
  const quote = result.indicators?.quote?.[0] || {};
  return timestamps
    .map((timestamp, index) => ({ date: formatDate(new Date(timestamp * 1000)), close: quote.close?.[index] ?? null, volume: quote.volume?.[index] ?? null }))
    .filter((point) => point.close != null);
}

async function fetchYahooSeries(symbol, range = "1y") {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=${range}&includePrePost=false&events=div%2Csplits`;
  return parseYahooChart(await fetchJson(url));
}

function parseCoinGeckoMarketChart(payload) {
  return (payload.market_caps || []).map(([ts, value]) => ({ date: formatDate(new Date(ts)), value }));
}

async function fetchCoinGeckoMarketCap(coinId, days = 365) {
  const url = `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart?vs_currency=usd&days=${days}&interval=daily`;
  return parseCoinGeckoMarketChart(await fetchJson(url));
}

async function fetchCoinGeckoCurrentMarkets(ids) {
  const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${encodeURIComponent(ids.join(","))}`;
  const payload = await fetchJson(url);
  const result = {};
  for (const item of payload) {
    result[item.id] = { marketCap: item.market_cap ?? null };
  }
  return result;
}

function parseFredCsv(csv) {
  return csv.trim().split(/\r?\n/).slice(1).map((line) => line.split(",")).filter((parts) => parts.length >= 2 && parts[1] !== ".").map(([date, value]) => ({ date, value: Number(value) }));
}

async function fetchFredSeries(seriesId) {
  return parseFredCsv(await fetchText(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${seriesId}`));
}

async function fetchFearGreed(limit = 365) {
  const payload = await fetchJson(`https://api.alternative.me/fng/?limit=${limit}&format=json`);
  return (payload.data || []).map((item) => ({ date: formatDate(new Date(Number(item.timestamp) * 1000)), value: Number(item.value) }));
}

function parseRssItems(xml) {
  const decodeHtml = (text) => text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&quot;/g, '"');
  const getTag = (block, tag) => {
    const match = block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i"));
    return match ? decodeHtml(match[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim()) : "";
  };
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((match) => ({
    title: getTag(match[1], "title"),
    link: getTag(match[1], "link"),
    pubDate: getTag(match[1], "pubDate"),
    source: getTag(match[1], "source") || "Google News",
  }));
}

async function fetchNews() {
  const allItems = [];
  for (const query of NEWS_QUERIES) {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
    allItems.push(...parseRssItems(await fetchText(url)));
  }
  const deduped = new Map();
  for (const item of allItems) {
    if (!item.title) continue;
    deduped.set(`${item.title}|${item.pubDate}`, item);
  }
  return [...deduped.values()].sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate)).slice(0, 18);
}

function scoreHeadline(title) {
  const text = title.toLowerCase();
  let score = 0;
  let category = "基本面";
  const themeHits = [];
  const positive = ["partnership", "adoption", "launch", "approval", "wins", "surge", "record", "growth", "expands", "boost", "bull", "buy"];
  const negative = ["lawsuit", "probe", "ban", "decline", "outflow", "selloff", "hack", "fraud", "delay", "cuts", "downgrade", "risk"];

  if (text.includes("bitcoin") || text.includes("btc") || text.includes("crypto")) category = "BTC周期";
  if (text.includes("fed") || text.includes("treasury") || text.includes("yield") || text.includes("rate")) category = "利率";
  if (text.includes("regulation") || text.includes("congress") || text.includes("sec") || text.includes("mica")) category = "监管";
  if (text.includes("tether") || text.includes("pyusd") || text.includes("paypal")) category = "竞争";
  if (text.includes("circle") || text.includes("usdc") || text.includes("crcl")) category = text.includes("regulation") ? "监管" : "基本面";

  for (const word of positive) if (text.includes(word)) score += 1.2;
  for (const word of negative) if (text.includes(word)) score -= 1.2;
  if (text.includes("circle") || text.includes("crcl") || text.includes("usdc")) score *= 1.2;
  if (text.includes("tether")) score -= 0.5;
  if (text.includes("hawkish")) score -= 0.8;
  if (text.includes("rate cut") || text.includes("dovish")) score += 0.8;

  for (const [themeKey, theme] of Object.entries(NEWS_THEMES)) {
    if (!theme.keywords.some((keyword) => text.includes(keyword))) continue;
    let themeScore = 0;
    for (const word of theme.positive) if (text.includes(word)) themeScore += 1.4;
    for (const word of theme.negative) if (text.includes(word)) themeScore -= 1.4;
    if (themeKey === "competition") themeScore *= -1;
    const weighted = clamp(themeScore * theme.weight, -5, 5);
    score += weighted;
    category = theme.category;
    themeHits.push({ key: themeKey, label: theme.label, score: weighted });
  }

  return { impact: score > 0.5 ? "positive" : score < -0.5 ? "negative" : "neutral", category, score: clamp(score, -5, 5), themeHits };
}

function buildThemePulse(news) {
  const buckets = Object.fromEntries(Object.entries(NEWS_THEMES).map(([key, theme]) => [key, { key, label: theme.label, score: 0, mentions: 0 }]));
  for (const item of news) {
    for (const hit of item.themeHits || []) {
      buckets[hit.key].score += hit.score;
      buckets[hit.key].mentions += 1;
    }
  }
  return Object.values(buckets).map((item) => ({ ...item, score: round(item.score, 2) })).sort((a, b) => Math.abs(b.score) - Math.abs(a.score));
}

function createCarryForward(points, selector) {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  let pointer = 0;
  let lastValue = null;
  return (date) => {
    while (pointer < sorted.length && sorted[pointer].date <= date) {
      lastValue = selector(sorted[pointer]);
      pointer += 1;
    }
    return lastValue;
  };
}

function buildNewsDaily(preparedNews) {
  const daily = new Map();
  for (const item of preparedNews) {
    const date = item.publishedAt.slice(0, 10);
    daily.set(date, round((daily.get(date) || 0) + (item.headlineScore || 0), 2));
  }
  return [...daily.entries()].map(([date, value]) => ({ date, value }));
}

function mergeSeriesByDate(crcl, btc, usdc, peerCaps, tbill, fearGreed, newsDaily) {
  const getBtc = createCarryForward(btc, (point) => point.close);
  const getUsdc = createCarryForward(usdc, (point) => point.value);
  const getTbill = createCarryForward(tbill, (point) => point.value);
  const getFear = createCarryForward(fearGreed, (point) => point.value);
  const getNews = createCarryForward(newsDaily, (point) => point.value);

  return crcl.map((point) => {
    const usdcValue = getUsdc(point.date);
    const stablecoinBase = [usdcValue, peerCaps.tether?.marketCap, peerCaps["paypal-usd"]?.marketCap, peerCaps["first-digital-usd"]?.marketCap].filter((value) => value != null).reduce((sum, value) => sum + value, 0);
    return {
      date: point.date,
      crclClose: point.close,
      crclVolume: point.volume,
      btcClose: getBtc(point.date),
      usdcMcap: usdcValue,
      usdcShare: stablecoinBase ? usdcValue / stablecoinBase : null,
      tbill3m: getTbill(point.date),
      fearGreed: getFear(point.date),
      themeNewsScore: getNews(point.date),
    };
  });
}

function buildScoredSeries(series) {
  const crcl = series.map((point) => point.crclClose);
  const btc = series.map((point) => point.btcClose);
  const usdc = series.map((point) => point.usdcMcap);
  const share = series.map((point) => point.usdcShare);
  const tbill = series.map((point) => point.tbill3m);
  const fear = series.map((point) => point.fearGreed);
  const theme = series.map((point) => point.themeNewsScore);

  const forwardReturn5d = crcl.map((value, index) => {
    const future = crcl[index + 5];
    if (value == null || future == null || value === 0) return null;
    return future / value - 1;
  });

  const btcMomentum = pctChange(btc, 5);
  const btcAcceleration = diff(btcMomentum, 3);
  const usdcGrowth = pctChange(usdc, 7);
  const usdcShareChange = diff(share, 7);
  const tbillInverse = diff(tbill, 10).map((value) => (value == null ? null : value * -1));
  const sentiment = fear.map((value) => (value == null ? null : clamp((value - 50) / 25, -2, 2)));
  const priceVsMa20 = crcl.map((value, index) => {
    const ma = movingAverage(crcl, 20)[index];
    if (value == null || ma == null || ma === 0) return null;
    return value / ma - 1;
  });

  const modelResults = MODEL_LIBRARY.map((model) => {
    let ema = 0;
    const scores = [];
    for (let index = 0; index < series.length; index += 1) {
      const raw =
        model.weights.btcMomentum * zscoreAt(btcMomentum, index) +
        model.weights.btcAcceleration * zscoreAt(btcAcceleration, index) +
        model.weights.usdcGrowth * zscoreAt(usdcGrowth, index) +
        model.weights.usdcShare * zscoreAt(usdcShareChange, index) +
        model.weights.tbillInverse * zscoreAt(tbillInverse, index) +
        model.weights.sentiment * zscoreAt(sentiment, index) +
        model.weights.thematicNews * zscoreAt(theme, index) +
        0.06 * zscoreAt(priceVsMa20, index);
      ema = scores.length === 0 ? raw : ema * (1 - model.smoothing) + raw * model.smoothing;
      scores.push(round(50 + ema * 12, 2));
    }
    return { ...model, scores, correlation: pearson(scores, forwardReturn5d) };
  }).sort((a, b) => Math.abs(b.correlation || 0) - Math.abs(a.correlation || 0));

  const bestModel = modelResults[0];
  const scoredSeries = series.map((point, index) => {
    const score = bestModel.scores[index];
    const slope = index > 0 ? score - bestModel.scores[index - 1] : null;
    const acceleration = index > 1 ? slope - (bestModel.scores[index - 1] - bestModel.scores[index - 2]) : null;
    return {
      date: point.date,
      crcl_close: round(point.crclClose, 2),
      driver_score: round(score, 2),
      driver_slope: round(slope, 2),
      driver_acceleration: round(acceleration, 2),
      btc_momentum_5d: round(btcMomentum[index], 4),
      usdc_growth_7d: round(usdcGrowth[index], 4),
      usdc_share_change_7d: round(usdcShareChange[index], 5),
      theme_news_score: round(point.themeNewsScore, 2),
      tbill_3m: point.tbill3m,
      fear_greed: point.fearGreed,
    };
  });

  return { scoredSeries, bestModel };
}

function classifyIndicators(latest) {
  return {
    usdc_minting_trend: latest.usdc_growth_7d == null ? "持平" : latest.usdc_growth_7d > 0.01 ? "净铸造" : latest.usdc_growth_7d < -0.01 ? "净销毁" : "持平",
    btc_momentum: latest.btc_momentum_5d == null ? "横盘" : latest.btc_momentum_5d > 0.04 ? "上升" : latest.btc_momentum_5d < -0.04 ? "下降" : "横盘",
    rate_expectation: latest.tbill_3m == null ? "按兵不动" : "按兵不动",
    crypto_sentiment: latest.fear_greed == null ? "中性" : latest.fear_greed >= 80 ? "极度贪婪" : latest.fear_greed >= 60 ? "贪婪" : latest.fear_greed <= 20 ? "极度恐惧" : latest.fear_greed <= 40 ? "恐惧" : "中性",
    leading_action: (latest.driver_score || 0) >= 66 ? "积极做多" : (latest.driver_score || 0) >= 58 ? "逢低买入" : (latest.driver_score || 0) <= 42 ? "减仓防守" : "观望",
    second_derivative: (latest.driver_acceleration || 0) > 0.8 ? "改善加速" : (latest.driver_acceleration || 0) < -0.8 ? "走弱加速" : "中性",
  };
}

function buildRecommendation(latest, themePulse) {
  const score = latest.driver_score || 50;
  let recommendation = "持有";
  let confidence = "中";
  if (score >= 70) { recommendation = "买入"; confidence = "高"; }
  else if (score >= 60) recommendation = "买入";
  else if (score <= 40) { recommendation = "减仓"; confidence = "高"; }

  const reasons = [];
  if ((latest.usdc_growth_7d || 0) > 0.01) reasons.push("USDC市值近7日扩张，领先基本面对Circle偏正面。");
  if ((latest.btc_momentum_5d || 0) > 0.04) reasons.push("BTC维持强动量，CRCL作为高beta代理容易同步受益。");
  if ((themePulse.find((item) => item.key === "genius")?.mentions || 0) > 0) reasons.push("GENIUS 主题已进入监控脉冲，后续若继续转正会强化Circle监管叙事。");
  if ((themePulse.find((item) => item.key === "analyst")?.mentions || 0) > 0) reasons.push("分析师评级主题已被捕捉，后续升级/下调会直接影响短线风险偏好。");

  const risks = [];
  if ((themePulse.find((item) => item.key === "competition")?.score || 0) < 0) risks.push("竞品稳定币新闻流偏强，可能压制USDC份额预期。");
  if ((latest.driver_acceleration || 0) < -0.8) risks.push("二阶导转弱，恶化速度在加快。");

  return { recommendation, confidence, reasoning: reasons.join(""), risk_alerts: risks };
}

function buildPriceTarget(latest) {
  const price = latest.crcl_close || 0;
  const score = latest.driver_score || 50;
  return {
    bull_case: `${money(price * (1.18 + Math.max(score - 60, 0) / 200))}（BTC风险偏好延续、USDC继续扩张）`,
    base_case: `${money(price * (1 + (score - 50) / 180))}（基本面平稳，估值维持当前斜率）`,
    bear_case: `${money(Math.max(50, price * (0.86 - Math.max(45 - score, 0) / 220)))}（参考ATL与利率/风险资产共振回撤）`,
    floor: "$50（用户框架中的已验证ATL）",
  };
}

function buildKeyEvents(preparedNews) {
  return preparedNews.slice(0, 6).map((item) => ({
    event: item.title,
    source: item.source,
    impact: item.impact,
    impactScore: Math.max(1, Math.round(Math.abs(item.headlineScore) || 1)),
    driverCategory: item.driverCategory,
    weightedThemes: (item.themeHits || []).map((hit) => hit.label).join(" / ") || "常规",
  }));
}

function buildMarkdown(report) {
  const ms = report.marketSnapshot;
  const li = report.leadingIndicators;
  const lines = [
    `CRCL 每日监控 | ${report.date}`,
    "",
    `当前结论：${report.action.recommendation}（置信度 ${report.action.confidence}）`,
    `驱动分：${ms.driver_score} | 日变化 ${ms.driver_score_change} | 二阶导 ${li.second_derivative}`,
    "",
    "市场快照",
    `- CRCL: ${ms.crcl_price}（${ms.crcl_change}）`,
    `- BTC: ${ms.btc_price}（${ms.btc_change}）`,
    `- USDC市值: ${ms.usdc_mcap}（7日 ${ms.usdc_change}）`,
    `- USDC份额: ${ms.usdc_share}`,
    `- 3M T-Bill: ${ms.tbill_3m}`,
    `- 恐惧贪婪: ${ms.fear_greed}`,
    "",
    "主题脉冲",
    ...report.themePulse.map((item) => `- ${item.label}: ${signed(item.score, 2)} | 提及 ${item.mentions} 次`),
    "",
    "关键事件",
    ...report.keyEvents.map((event, index) => `${index + 1}. [${event.impact === "positive" ? "利好" : event.impact === "negative" ? "利空" : "中性"}] ${event.event} | ${event.driverCategory} | ${event.weightedThemes}`),
    "",
    "综合判断",
    report.action.reasoning || "暂无。",
    "",
    "明日关注",
    ...report.tomorrowWatchlist.map((item) => `- ${item}`),
  ];
  return lines.join("\n");
}

async function writeChartCsv(scoreSeries) {
  const header = "date,crcl_close,driver_score,theme_news_score";
  const rows = scoreSeries.slice(-252).map((item) => [item.date, item.crcl_close ?? "", item.driver_score ?? "", item.theme_news_score ?? 0].join(","));
  await fs.writeFile(CHART_CSV_FILE, [header, ...rows].join("\n"), "utf8");
}

async function generateChartPng() {
  try {
    await execFileAsync("powershell", ["-ExecutionPolicy", "Bypass", "-File", path.join(BASE_DIR, "generate_crcl_chart.ps1")], { cwd: BASE_DIR, timeout: 120000 });
    await fs.stat(CHART_PNG_FILE);
    return CHART_PNG_FILE;
  } catch {
    return null;
  }
}

async function getTenantToken() {
  const appId = process.env.FEISHU_APP_ID;
  const appSecret = process.env.FEISHU_APP_SECRET;
  if (!appId || !appSecret) return null;
  const response = await fetch("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8", "User-Agent": USER_AGENT },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  });
  if (!response.ok) return null;
  const payload = await response.json();
  return payload.code === 0 ? payload.tenant_access_token : null;
}

async function uploadImage(filePath) {
  if (!filePath) return null;
  const tenantToken = await getTenantToken();
  if (!tenantToken) return null;
  const buffer = await fs.readFile(filePath);
  const form = new FormData();
  form.append("image_type", "message");
  form.append("image", new Blob([buffer], { type: "image/png" }), path.basename(filePath));
  const response = await fetch("https://open.feishu.cn/open-apis/im/v1/images", {
    method: "POST",
    headers: { Authorization: `Bearer ${tenantToken}`, "User-Agent": USER_AGENT },
    body: form,
  });
  if (!response.ok) return null;
  const payload = await response.json();
  return payload.code === 0 ? payload.data?.image_key || null : null;
}

async function sendFeishu(text, imageKey) {
  if (!isPushEnabled()) return false;
  const webhook = process.env.FEISHU_WEBHOOK_URL;
  if (!webhook) return false;
  const textResp = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8", "User-Agent": USER_AGENT },
    body: JSON.stringify({ msg_type: "text", content: { text } }),
  });
  if (!textResp.ok) throw new Error(`Feishu text push failed ${textResp.status}`);
  if (imageKey) {
    const imageResp = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8", "User-Agent": USER_AGENT },
      body: JSON.stringify({ msg_type: "image", content: { image_key: imageKey } }),
    });
    if (!imageResp.ok) throw new Error(`Feishu image push failed ${imageResp.status}`);
  }
  return true;
}

function isGitHubActions() {
  return process.env.GITHUB_ACTIONS === "true";
}

async function main() {
  await fs.mkdir(STATE_DIR, { recursive: true });

  const [crcl, btc, usdc, peerCaps, tbill, fearGreed, rawNews] = await Promise.all([
    fetchYahooSeries("CRCL", "1y"),
    fetchYahooSeries("BTC-USD", "1y"),
    fetchCoinGeckoMarketCap("usd-coin"),
    fetchCoinGeckoCurrentMarkets(["usd-coin", "tether", "paypal-usd", "first-digital-usd"]),
    fetchFredSeries("DTB3"),
    fetchFearGreed(365),
    fetchNews(),
  ]);

  const preparedNews = rawNews.map((item) => {
    const scored = scoreHeadline(item.title);
    return {
      ...item,
      headlineScore: round(scored.score, 2),
      impact: scored.impact,
      driverCategory: scored.category,
      themeHits: scored.themeHits,
      publishedAt: item.pubDate ? formatDateTime(new Date(item.pubDate)) : "",
    };
  });

  const themePulse = buildThemePulse(preparedNews);
  const mergedSeries = mergeSeriesByDate(crcl, btc, usdc, peerCaps, tbill, fearGreed, buildNewsDaily(preparedNews));
  const { scoredSeries, bestModel } = buildScoredSeries(mergedSeries);
  const latest = scoredSeries.at(-1);
  const prev = scoredSeries.at(-2) || null;

  const report = {
    system: "crcl",
    date: latest.date,
    generatedAt: formatDateTime(new Date()),
    marketSnapshot: {
      crcl_price: money(latest.crcl_close),
      crcl_change: pct(prev?.crcl_close ? latest.crcl_close / prev.crcl_close - 1 : null),
      btc_price: money(mergedSeries.at(-1)?.btcClose, 0),
      btc_change: pct(mergedSeries.at(-2)?.btcClose ? mergedSeries.at(-1).btcClose / mergedSeries.at(-2).btcClose - 1 : null),
      usdc_mcap: money(mergedSeries.at(-1)?.usdcMcap, 2),
      usdc_change: pct(latest.usdc_growth_7d),
      usdc_share: mergedSeries.at(-1)?.usdcShare == null ? "N/A" : pct(mergedSeries.at(-1).usdcShare, 2),
      tbill_3m: mergedSeries.at(-1)?.tbill3m == null ? "N/A" : `${mergedSeries.at(-1).tbill3m.toFixed(2)}%`,
      fear_greed: mergedSeries.at(-1)?.fearGreed == null ? "N/A" : String(mergedSeries.at(-1).fearGreed),
      driver_score: latest.driver_score?.toFixed(1) ?? "N/A",
      driver_score_change: latest.driver_slope == null ? "N/A" : signed(latest.driver_slope, 2),
    },
    themePulse,
    leadingIndicators: classifyIndicators(latest),
    keyEvents: buildKeyEvents(preparedNews),
    priceTarget: buildPriceTarget(latest),
    action: buildRecommendation(latest, themePulse),
    tomorrowWatchlist: [
      "USDC市值与市场份额是否继续扩张，尤其是相对USDT与PYUSD的变化。",
      "BTC是否延续5日动量，若跌破强趋势区间，CRCL通常会放大回撤。",
      "3个月美债收益率是否重新上行，利率反弹会压制高弹性成长股估值。",
      "继续跟踪GENIUS法案是否从讨论进入更明确的推进阶段。",
      "留意新的分析师评级、目标价调整和 initiate coverage。",
    ],
    model: {
      name: bestModel.name,
      correlation: bestModel.correlation == null ? "N/A" : Number(bestModel.correlation.toFixed(3)),
    },
    scoreSeries: scoredSeries,
  };

  await writeChartCsv(report.scoreSeries);
  const pngPath = await generateChartPng();
  const imageKey = isPushEnabled() ? await uploadImage(pngPath) : null;
  report.chart = { local_png: pngPath, feishu_image_key: imageKey };

  const markdown = buildMarkdown(report);
  const pushed = await sendFeishu(markdown, imageKey).catch(() => false);
  report.delivery = {
    push_enabled: isPushEnabled(),
    webhook_present: Boolean(process.env.FEISHU_WEBHOOK_URL),
    app_credentials_present: Boolean(process.env.FEISHU_APP_ID && process.env.FEISHU_APP_SECRET),
    text_push_success: pushed,
    image_push_attempted: Boolean(imageKey),
  };

  await fs.writeFile(REPORT_FILE, JSON.stringify(report, null, 2), "utf8");
  console.log(markdown);
  console.log(!isPushEnabled() ? "\nCRCL Feishu 推送已暂停。" : pushed ? "\nCRCL Feishu 推送成功。" : "\nCRCL Feishu 推送失败。");

  if (isPushEnabled() && !process.env.FEISHU_WEBHOOK_URL && isGitHubActions()) {
    throw new Error("Missing FEISHU_WEBHOOK_URL in GitHub Actions secrets.");
  }

  if (isPushEnabled() && !pushed && isGitHubActions()) {
    throw new Error("CRCL Feishu push failed in GitHub Actions.");
  }
}

main().catch((error) => {
  console.error(String(error));
  process.exitCode = 1;
});
