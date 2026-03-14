import crypto from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import process from "node:process";

const BASE_DIR = process.cwd();
const CONFIG_DIR = path.join(BASE_DIR, "config");
const STATE_DIR = path.join(BASE_DIR, ".state");
const ENV_FILE = path.join(BASE_DIR, ".env");
const USER_AGENT = "Mozilla/5.0 (compatible; RationalInvestorBot/1.0)";
const TZ = "Asia/Shanghai";
const DEFAULT_PORT = 8787;
const RUNTIME_LOG_FILE = path.join(STATE_DIR, "listener_runtime.log");

function formatDateTime(date) {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const year = parts.find((item) => item.type === "year")?.value;
  const month = parts.find((item) => item.type === "month")?.value;
  const day = parts.find((item) => item.type === "day")?.value;
  const hour = parts.find((item) => item.type === "hour")?.value;
  const minute = parts.find((item) => item.type === "minute")?.value;
  const second = parts.find((item) => item.type === "second")?.value;
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

async function readText(file, fallback = "") {
  try {
    return await fs.readFile(file, "utf8");
  } catch {
    return fallback;
  }
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJson(file, value) {
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function appendRuntimeLog(message) {
  await fs.mkdir(STATE_DIR, { recursive: true });
  await fs.appendFile(RUNTIME_LOG_FILE, `[${formatDateTime(new Date())}] ${message}\n`, "utf8");
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

async function ensureFiles() {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
  await fs.mkdir(STATE_DIR, { recursive: true });
  const inboxPath = path.join(STATE_DIR, "feishu_inbox.log");
  try {
    await fs.access(inboxPath);
  } catch {
    await fs.writeFile(inboxPath, "", "utf8");
  }
  try {
    await fs.access(RUNTIME_LOG_FILE);
  } catch {
    await fs.writeFile(RUNTIME_LOG_FILE, "", "utf8");
  }
}

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeText(content) {
  return (content || "").replace(/\r\n/g, "\n").trim();
}

async function loadWatchlist() {
  return readJson(path.join(CONFIG_DIR, "watchlist.json"), []);
}

function splitCommand(text) {
  const match = text.match(/^([^：:]+)[：:]\s*([\s\S]*)$/);
  if (!match) return null;
  return {
    command: match[1].trim(),
    payload: match[2].trim(),
  };
}

function parseList(text) {
  return text
    .split(/[、,，]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeMarket(value) {
  const raw = (value || "").trim().toLowerCase();
  if (["us", "usa", "美股", "美国"].includes(raw)) return "us";
  if (["hongkong", "hk", "港股", "香港"].includes(raw)) return "hongkong";
  if (["china", "cn", "a股", "沪深", "中国"].includes(raw)) return "china";
  return raw || "us";
}

function mapProfileKey(key) {
  const normalized = key.trim().toLowerCase();
  const mapping = {
    thesis: "thesis",
    逻辑: "thesis",
    投资逻辑: "thesis",
    longceiling: "longCeiling",
    长期空间: "longCeiling",
    长期天花板: "longCeiling",
    shortgrowth: "shortGrowth",
    短期增长: "shortGrowth",
    valuation: "valuation",
    估值: "valuation",
    businessmomentum: "businessMomentum",
    基本面: "businessMomentum",
    基本面趋势: "businessMomentum",
    governance: "governance",
    治理: "governance",
    公司治理: "governance",
    capitaloperations: "capitalOperations",
    资本运作: "capitalOperations",
    narrative: "narrativeStrength",
    narrativeStrength: "narrativeStrength",
    叙事: "narrativeStrength",
    macrofit: "macroFit",
    宏观匹配: "macroFit",
    市场匹配: "macroFit",
    hardchangecheck: "hardChangeCheck",
    重大变化: "hardChangeCheck",
    催化剂: "keyCatalysts",
    catalyst: "keyCatalysts",
    风险: "keyRisks",
    risks: "keyRisks",
    备注: "notes",
    notes: "notes",
  };
  return mapping[normalized] || key.trim();
}

function normalizeProfileValue(targetKey, value) {
  const trimmed = value.trim();
  if (["keyCatalysts", "keyRisks"].includes(targetKey)) return parseList(trimmed);
  if (targetKey === "hardChangeCheck") {
    const raw = trimmed.toLowerCase();
    if (["yes", "是", "true", "1"].includes(raw)) return "yes";
    return "no";
  }
  const enumMap = {
    high: ["high", "高", "高空间", "强"],
    medium: ["medium", "中", "中等"],
    low: ["low", "低", "低空间", "弱"],
    weak: ["weak", "偏弱", "弱"],
    negative: ["negative", "负面", "差"],
    cheap: ["cheap", "便宜", "低估"],
    reasonable: ["reasonable", "合理", "正常"],
    expensive: ["expensive", "贵", "偏贵", "高估"],
    bubble: ["bubble", "泡沫"],
    strong: ["strong", "强", "很强"],
    improving: ["improving", "改善", "向上", "边际改善"],
    stable: ["stable", "稳定", "平稳"],
    weakening: ["weakening", "转弱", "走弱"],
    deteriorating: ["deteriorating", "恶化"],
    normal: ["normal", "一般", "正常"],
    positive: ["positive", "正面", "积极", "增持", "回购"],
    neutral: ["neutral", "中性"],
    aligned: ["aligned", "匹配", "一致", "顺风"],
    mixed: ["mixed", "一般匹配", "混合"],
    misaligned: ["misaligned", "不匹配", "逆风"],
  };
  for (const [canonical, aliases] of Object.entries(enumMap)) {
    if (aliases.includes(trimmed.toLowerCase()) || aliases.includes(trimmed)) {
      return canonical;
    }
  }
  return trimmed;
}

async function appendLine(file, line) {
  await fs.appendFile(file, `${line}\n`, "utf8");
}

function inferProfileUpdatesFromKnowHow(text) {
  const normalized = text.toLowerCase();
  const updates = {};

  if (/低估|便宜|估值低|undervalued|cheap/.test(text)) updates.valuation = "cheap";
  if (/合理估值|估值合理|reasonable/.test(text)) updates.valuation = "reasonable";
  if (/高估|偏贵|估值贵|expensive|overvalued/.test(text)) updates.valuation = "expensive";

  if (/基本面改善|边际改善|向上|恢复|回暖|improving/.test(text)) updates.businessMomentum = "improving";
  if (/强劲增长|高增长|爆发|strong growth|strong/.test(normalized)) updates.shortGrowth = "high";
  if (/增长放缓|走弱|承压|weakening|deteriorating/.test(normalized) || /恶化/.test(text)) updates.businessMomentum = "weakening";

  if (/管理层增持|增持|回购|注销回购|buyback|repurchase/.test(normalized)) updates.capitalOperations = "positive";
  if (/减持|增发|配股|融资|offering|dilution/.test(normalized)) updates.capitalOperations = "negative";

  if (/叙事强|逻辑强|长期空间大|天花板高|high ceiling/.test(normalized) || /天花板高/.test(text)) {
    updates.longCeiling = "high";
    updates.narrativeStrength = "strong";
  }
  if (/叙事弱|逻辑变差|天花板有限/.test(text)) {
    updates.narrativeStrength = "weak";
    updates.longCeiling = "low";
  }

  if (/重大变化|逻辑破坏|清仓|马上卖|hard change/.test(normalized) || /重大变化/.test(text)) {
    updates.hardChangeCheck = "yes";
  }

  return updates;
}

async function updatePhilosophy(text, source) {
  const philosophyPath = path.join(CONFIG_DIR, "philosophy.md");
  const feedbackPath = path.join(CONFIG_DIR, "feedback_inbox.md");
  const timestamp = formatDateTime(new Date());
  await appendLine(
    philosophyPath,
    `\n## 飞书增量心得 ${timestamp}\n- ${text.replace(/\n+/g, "\n- ")}\n`,
  );
  await appendLine(feedbackPath, `- ${timestamp} | ${source} | ${text.replace(/\n/g, " / ")}`);
  return "已经收到并纳入更新体系";
}

async function addWatchlist(payload) {
  const watchlistPath = path.join(CONFIG_DIR, "watchlist.json");
  const parts = payload.split("|").map((item) => item.trim()).filter(Boolean);
  if (parts.length < 4) {
    throw new Error("加入自选股格式应为：加入自选股：代码 | 名称 | 板块 | 市场");
  }
  const [ticker, name, sector, marketRaw] = parts;
  const watchlist = await readJson(watchlistPath, []);
  const market = normalizeMarket(marketRaw);
  const existing = watchlist.find((item) => item.ticker.toUpperCase() === ticker.toUpperCase());
  if (existing) {
    existing.name = name;
    existing.sector = sector;
    existing.market = market;
    existing.enabled = true;
  } else {
    watchlist.push({ ticker: ticker.toUpperCase(), name, sector, market, enabled: true });
  }
  await writeJson(watchlistPath, watchlist);
  return `已更新自选股：${ticker.toUpperCase()} ${name}`;
}

async function removeWatchlist(payload) {
  const ticker = payload.trim().toUpperCase();
  if (!ticker) throw new Error("移除自选股格式应为：移除自选股：代码");
  const watchlistPath = path.join(CONFIG_DIR, "watchlist.json");
  const watchlist = await readJson(watchlistPath, []);
  const next = watchlist.filter((item) => item.ticker.toUpperCase() !== ticker);
  await writeJson(watchlistPath, next);
  return `已移除自选股：${ticker}`;
}

async function updateCompanyProfile(payload) {
  const profilePath = path.join(CONFIG_DIR, "company_profiles.json");
  const knowHowPath = path.join(CONFIG_DIR, "company_knowhow.md");
  const watchlist = await loadWatchlist();
  let parts = payload.split("|").map((item) => item.trim()).filter(Boolean);
  let ticker = "";

  if (parts.length >= 2) {
    const first = parts[0].toUpperCase();
    const matched = watchlist.find((item) => item.ticker.toUpperCase() === first || item.name === parts[0]);
    ticker = matched?.ticker || first;
  } else {
    const compact = payload.trim();
    const candidates = [...watchlist].sort((a, b) => b.name.length - a.name.length);
    const matched = candidates.find((item) => compact.includes(item.name) || compact.toUpperCase().includes(item.ticker.toUpperCase()));
    if (!matched) {
      throw new Error("公司knowhow 需要至少包含公司代码或公司名，例如：公司knowhow：0700.HK | 逻辑=... 或 公司knowhow：腾讯的AI进展是核心因素");
    }
    ticker = matched.ticker;
    const cleaned = compact
      .replace(new RegExp(matched.ticker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig"), "")
      .replace(matched.name, "")
      .replace(/^[的\s:：-]+/, "")
      .trim();
    parts = [ticker, cleaned || compact];
  }

  if (!ticker || parts.length < 2) {
    throw new Error("更新公司格式应为：更新公司：代码 | 字段=值 | 字段=值");
  }

  const profiles = await readJson(profilePath, {});
  const current = { ...(profiles[ticker] || {}) };
  const freeformNotes = [];

  for (const fragment of parts.slice(1)) {
    const eqIndex = fragment.includes("=") ? fragment.indexOf("=") : fragment.indexOf(":");
    if (eqIndex <= 0) {
      freeformNotes.push(fragment);
      continue;
    }
    const rawKey = fragment.slice(0, eqIndex).trim();
    const rawValue = fragment.slice(eqIndex + 1).trim();
    const targetKey = mapProfileKey(rawKey);
    current[targetKey] = normalizeProfileValue(targetKey, rawValue);
  }

  const fullKnowHowText = parts.slice(1).join(" | ");
  Object.assign(current, inferProfileUpdatesFromKnowHow(fullKnowHowText));

  if (freeformNotes.length) {
    const joined = freeformNotes.join("；");
    current.notes = current.notes ? `${current.notes}；${joined}` : joined;
  }

  profiles[ticker] = current;
  await writeJson(profilePath, profiles);
  await appendLine(knowHowPath, `- ${formatDateTime(new Date())} | ${ticker} | ${fullKnowHowText}`);
  return "已经收到并纳入更新体系";
}

function helpText() {
  return [
    "可用指令：",
    "1. 心得：牛市里利空不跌，是最重要的持仓信号",
    "2. 加入自选股：TSM | 台积电 | 制造/电子 | us",
    "3. 移除自选股：AAPL",
    "4. 更新公司：0700.HK | 逻辑=广告恢复与AI商业化 | 基本面=improving | 估值=reasonable | 催化剂=视频号变现,游戏新品",
    "5. 公司knowhow：0700.HK | 逻辑=这里写你对公司的最新理解 | 催化剂=这里写催化剂 | 风险=这里写风险 | 备注=这里写经验判断",
    "6. 公司knowhow：0700.HK | 这里也可以直接写自由表达，我会先记录原话，再自动归纳到公司画像",
  ].join("\n");
}

async function applyCommand(text, source) {
  const parsed = splitCommand(text);
  if (!parsed) {
    return `未识别指令。\n${helpText()}`;
  }

  const command = parsed.command.replace(/\s+/g, "").toLowerCase();
  if (["帮助", "help", "Help"].includes(command)) {
    return helpText();
  }
  if (["心得", "新增心得", "更新心得"].includes(command)) {
    return updatePhilosophy(parsed.payload, source);
  }
  if (["加入自选股", "添加自选股", "新增自选股"].includes(command)) {
    return addWatchlist(parsed.payload);
  }
  if (["移除自选股", "删除自选股"].includes(command)) {
    return removeWatchlist(parsed.payload);
  }
  if (["更新公司", "公司画像", "更新画像", "公司knowhow", "knowhow", "公司know how", "know how"].includes(command)) {
    return updateCompanyProfile(parsed.payload);
  }

  return `未识别指令“${parsed.command}”。\n${helpText()}`;
}

async function getTenantAccessToken() {
  const appId = process.env.FEISHU_APP_ID;
  const appSecret = process.env.FEISHU_APP_SECRET;
  if (!appId || !appSecret) return null;

  const response = await fetch("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal", {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "User-Agent": USER_AGENT,
    },
    body: JSON.stringify({
      app_id: appId,
      app_secret: appSecret,
    }),
  });

  if (!response.ok) return null;
  const payload = await response.json();
  return payload.tenant_access_token || null;
}

async function sendAppMessage(openId, text) {
  const token = await getTenantAccessToken();
  if (!token || !openId) return false;

  const response = await fetch("https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=open_id", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
      "User-Agent": USER_AGENT,
    },
    body: JSON.stringify({
      receive_id: openId,
      msg_type: "text",
      content: JSON.stringify({ text }),
    }),
  });

  return response.ok;
}

async function logIncoming(payload) {
  const inboxPath = path.join(STATE_DIR, "feishu_inbox.log");
  await appendLine(inboxPath, `${formatDateTime(new Date())} ${JSON.stringify(payload)}`);
}

async function verifySignature(req, bodyText) {
  const timestamp = req.headers["x-lark-request-timestamp"];
  const nonce = req.headers["x-lark-request-nonce"];
  const signature = req.headers["x-lark-signature"];
  const encryptKey = process.env.FEISHU_ENCRYPT_KEY;
  if (!encryptKey || !timestamp || !nonce || !signature) return true;

  const hmac = crypto.createHmac("sha256", encryptKey);
  hmac.update(timestamp);
  hmac.update(nonce);
  hmac.update(bodyText);
  const digest = `sha256=${hmac.digest("hex")}`;
  return digest === signature;
}

async function handleEvent(req, res, bodyText) {
  if (!(await verifySignature(req, bodyText))) {
    res.writeHead(401, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ code: 401, msg: "invalid signature" }));
    return;
  }

  const payload = safeJsonParse(bodyText, null);
  if (!payload) {
    res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ code: 400, msg: "invalid json" }));
    return;
  }

  await logIncoming(payload);

  if (payload.type === "url_verification" && payload.challenge) {
    const token = process.env.FEISHU_VERIFICATION_TOKEN;
    if (token && payload.token && payload.token !== token) {
      res.writeHead(401, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ code: 401, msg: "invalid token" }));
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ challenge: payload.challenge }));
    return;
  }

  const eventType = payload.header?.event_type;
  if (eventType !== "im.message.receive_v1") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ code: 0 }));
    return;
  }

  const messageType = payload.event?.message?.message_type;
  const messageContent = safeJsonParse(payload.event?.message?.content || "{}", {});
  const openId = payload.event?.sender?.sender_id?.open_id || null;
  const verificationToken = process.env.FEISHU_VERIFICATION_TOKEN;
  if (verificationToken && payload.header?.token && payload.header.token !== verificationToken) {
    res.writeHead(401, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ code: 401, msg: "invalid event token" }));
    return;
  }

  if (messageType !== "text" || !messageContent.text) {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ code: 0 }));
    await sendAppMessage(openId, "目前只支持文本指令。\n" + helpText());
    return;
  }

  const text = normalizeText(messageContent.text);
  let reply;
  try {
    reply = await applyCommand(text, openId || "unknown-user");
  } catch (error) {
    reply = `处理失败：${String(error.message || error)}`;
  }

  res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ code: 0 }));
  await sendAppMessage(openId, reply);
}

async function main() {
  await loadDotEnv();
  await ensureFiles();

  const port = Number(process.env.FEISHU_LISTENER_PORT || DEFAULT_PORT);
  const server = http.createServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/healthz") {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: true, time: formatDateTime(new Date()) }));
      return;
    }

    if (req.method !== "POST" || req.url !== "/feishu/events") {
      res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ code: 404, msg: "not found" }));
      return;
    }

    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", async () => {
      const bodyText = Buffer.concat(chunks).toString("utf8");
      await handleEvent(req, res, bodyText);
    });
    req.on("error", () => {
      res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ code: 500, msg: "stream error" }));
    });
  });

  server.listen(port, () => {
    console.log(`Feishu listener is running on http://127.0.0.1:${port}/feishu/events`);
    console.log(`Health check: http://127.0.0.1:${port}/healthz`);
    appendRuntimeLog(`Listener started on port ${port}`).catch(() => {});
  });

  server.on("error", (error) => {
    console.error(String(error));
    appendRuntimeLog(`Server error: ${String(error)}`).catch(() => {});
  });
}

main().catch((error) => {
  console.error(String(error));
  appendRuntimeLog(`Fatal error: ${String(error)}`).catch(() => {});
  process.exitCode = 1;
});

process.on("uncaughtException", (error) => {
  console.error(String(error));
  appendRuntimeLog(`Uncaught exception: ${String(error)}`).catch(() => {});
});

process.on("unhandledRejection", (reason) => {
  const text = String(reason);
  console.error(text);
  appendRuntimeLog(`Unhandled rejection: ${text}`).catch(() => {});
});
