import fs from "node:fs/promises";
import path from "node:path";

const BASE_DIR = process.cwd();
const CONFIG_DIR = path.join(BASE_DIR, "config");
const WATCHLIST_FILE = path.join(CONFIG_DIR, "watchlist.json");
const PROFILES_FILE = path.join(CONFIG_DIR, "company_profiles.json");

function isBrokenText(value) {
  if (typeof value !== "string" || !value.trim()) return true;
  return /\?{2,}|�/.test(value);
}

function readJson(file) {
  return fs.readFile(file, "utf8").then((text) => JSON.parse(text));
}

function scoreLabel(value, mapping, fallback) {
  return mapping[value] || fallback;
}

function buildSectorThesis(name, sector, profile) {
  const growth = scoreLabel(
    profile.shortGrowth,
    { high: "短期增长兑现较快", medium: "短期增长在跟踪期", weak: "短期增长偏弱", negative: "短期增长承压" },
    "短期增长仍需确认",
  );
  const valuation = scoreLabel(
    profile.valuation,
    { cheap: "估值偏低", reasonable: "估值大致合理", expensive: "估值偏贵", bubble: "估值明显透支" },
    "估值需要继续判断",
  );
  const momentum = scoreLabel(
    profile.businessMomentum,
    { strong: "基本面趋势强", improving: "基本面在改善", stable: "基本面相对稳定", weakening: "基本面边际走弱", deteriorating: "基本面明显恶化" },
    "基本面趋势待跟踪",
  );

  if (sector.includes("互联网/科技")) {
    return `${name} 当前更适合按平台能力、创新节奏和盈利质量来跟踪，${growth}，${valuation}，${momentum}。`;
  }
  if (sector.includes("游戏") || sector.includes("传媒")) {
    return `${name} 当前更适合按产品周期、用户活跃和内容兑现来判断，${growth}，${valuation}，${momentum}。`;
  }
  if (sector.includes("制造") || sector.includes("电子")) {
    return `${name} 当前更适合按产业周期、产能利用率和利润弹性来观察，${growth}，${valuation}，${momentum}。`;
  }
  if (sector.includes("大消费")) {
    return `${name} 当前更适合按品牌力、需求景气和经营效率来跟踪，${growth}，${valuation}，${momentum}。`;
  }
  if (sector.includes("加密货币") || sector.includes("Web3")) {
    return `${name} 当前更适合按监管进展、行业渗透和市场风险偏好来观察，${growth}，${valuation}，${momentum}。`;
  }
  return `${name} 当前更适合按长期空间、短期增长和估值匹配度来跟踪，${growth}，${valuation}，${momentum}。`;
}

function defaultCatalysts(sector) {
  if (sector.includes("互联网/科技")) return ["产品创新", "商业化提升", "利润率改善"];
  if (sector.includes("游戏") || sector.includes("传媒")) return ["新品周期", "用户增长", "内容变现"];
  if (sector.includes("制造") || sector.includes("电子")) return ["行业复苏", "新产品放量", "毛利率改善"];
  if (sector.includes("大消费")) return ["需求回暖", "门店扩张", "品牌升级"];
  if (sector.includes("加密货币") || sector.includes("Web3")) return ["监管进展", "用户增长", "行业景气回升"];
  return ["基本面改善", "估值修复", "新催化出现"];
}

function defaultRisks(sector) {
  if (sector.includes("互联网/科技")) return ["竞争加剧", "监管变化", "估值回落"];
  if (sector.includes("游戏") || sector.includes("传媒")) return ["产品不及预期", "热度回落", "用户流失"];
  if (sector.includes("制造") || sector.includes("电子")) return ["周期下行", "库存波动", "价格压力"];
  if (sector.includes("大消费")) return ["需求走弱", "价格竞争", "经营效率下滑"];
  if (sector.includes("加密货币") || sector.includes("Web3")) return ["监管收紧", "波动率过高", "风险偏好回落"];
  return ["基本面走弱", "估值收缩", "市场风格不匹配"];
}

function buildNotes(profile) {
  const parts = [];
  if (profile.valuation === "expensive" || profile.valuation === "bubble") parts.push("不宜情绪化追高");
  if (profile.shortGrowth === "weak" || profile.shortGrowth === "negative") parts.push("要更重视业绩兑现和边际变化");
  if (profile.capitalOperations === "positive") parts.push("资本运作偏正面时可适当提高跟踪优先级");
  if (profile.capitalOperations === "negative") parts.push("如出现减持增发要明显下调信任度");
  if (profile.hardChangeCheck === "yes") parts.push("已触发重大变化检查，应优先防守");
  if (!parts.length) parts.push("优先结合你的心得做公司画像判断，再用技术指标确认节奏");
  return parts.join("；") + "。";
}

const OVERRIDES = {
  "0700.HK": {
    thesis: "腾讯控股属于高质量中国互联网核心资产，游戏、广告、视频号与 AI 布局共同构成中期叙事，当前更重要的是跟踪利润恢复与估值匹配。",
    keyCatalysts: ["游戏新品周期", "广告恢复", "视频号与 AI 变现"],
    keyRisks: ["监管变化", "游戏流水不及预期", "互联网风险偏好回落"],
    notes: "如果基本面没有显著恶化，优先把回调看作波动而不是结构坏掉。"
  },
  "9988.HK": {
    thesis: "阿里巴巴更像估值修复与经营效率重估逻辑，核心观察点是电商护城河、云业务兑现和 AI 商业化能否带动利润质量提升。",
    keyCatalysts: ["云与 AI 进展", "股东回报提升", "国内消费修复"],
    keyRisks: ["竞争加剧", "组织执行偏弱", "市场预期反复"],
  },
  "PDD": {
    thesis: "拼多多属于高增长平台型资产，国内主站与 TEMU 的效率优势是核心，看点在增长持续性与利润兑现质量。",
    keyCatalysts: ["TEMU 扩张", "主站货币化提升", "利润率改善"],
    keyRisks: ["海外竞争", "监管变化", "高预期波动"],
  },
  "GOOGL": {
    thesis: "Google 的核心是搜索广告现金流与 AI 基础设施能力，长期空间仍大，但需要关注 AI 对原有搜索护城河的重塑速度。",
  },
  "META": {
    thesis: "Meta 的核心看广告效率、Reels 变现和 AI 投入回报，属于经营质量强但估值敏感度也高的品种。",
  },
  "MSFT": {
    thesis: "微软是企业软件与云计算平台龙头，Azure 与 Copilot 构成中期主线，适合重点跟踪商业化兑现而非短线波动。",
  },
  "NVDA": {
    thesis: "英伟达是 AI 算力主线核心受益者，长期天花板高，但市场预期已经很高，节奏管理比方向判断更重要。",
  },
  "AAPL": {
    thesis: "苹果是高质量平台型资产，优势在生态与现金流，但当前更像防守型核心持仓，需要观察创新周期能否重新提速。",
  },
  "AMZN": {
    thesis: "亚马逊的核心看电商效率、AWS 与广告协同，属于经营韧性强但估值弹性要靠利润释放来兑现的资产。",
  },
  "TSM": {
    thesis: "台积电是先进制程核心资产，判断重点在行业资本开支、先进制程稼动率和 AI 需求传导。",
  },
  "TSLA": {
    thesis: "特斯拉同时带有制造、品牌与科技叙事，核心在交付、利润率和自动驾驶兑现，分歧大时更要谨慎节奏。",
  },
  "PLTR": {
    thesis: "Palantir 的关键是政府与企业 AI 订单能否持续兑现，属于叙事强但估值要求也很高的公司。",
  },
  "COIN": {
    thesis: "Coinbase 更像加密行业基础设施资产，核心观察监管进展、交易活跃度与稳定币生态受益程度。",
  },
  "CRCL": {
    thesis: "Circle 的核心在于稳定币网络效应与合规红利，关键要看 USDC 渗透、政策边界和商业模式稳定性。",
  },
  "FIG": {
    thesis: "Figma 属于设计协同软件平台，判断重点在产品粘性、企业渗透和平台化空间，适合用长期软件龙头框架跟踪。",
  },
  "0100.HK": {
    thesis: "MiniMax 属于中国 AI 应用与模型能力方向标的，核心在技术迭代、商业化路径和估值预期管理。",
  },
  "2513.HK": {
    thesis: "智谱属于中国大模型方向的重要标的，关键观察模型能力、B 端落地和资本市场预期差。",
  },
};

async function main() {
  const watchlist = await readJson(WATCHLIST_FILE);
  const profiles = await readJson(PROFILES_FILE);

  for (const item of watchlist) {
    const profile = { ...(profiles[item.ticker] || {}) };
    const override = OVERRIDES[item.ticker] || {};

    if (isBrokenText(profile.thesis) || override.thesis) {
      profile.thesis = override.thesis || buildSectorThesis(item.name, item.sector, profile);
    }
    if (!Array.isArray(profile.keyCatalysts) || profile.keyCatalysts.some((value) => isBrokenText(value)) || override.keyCatalysts) {
      profile.keyCatalysts = override.keyCatalysts || defaultCatalysts(item.sector);
    }
    if (!Array.isArray(profile.keyRisks) || profile.keyRisks.some((value) => isBrokenText(value)) || override.keyRisks) {
      profile.keyRisks = override.keyRisks || defaultRisks(item.sector);
    }
    if (isBrokenText(profile.notes) || override.notes) {
      profile.notes = override.notes || buildNotes(profile);
    }

    profiles[item.ticker] = profile;
  }

  await fs.writeFile(PROFILES_FILE, `${JSON.stringify(profiles, null, 2)}\n`, "utf8");
  console.log("company_profiles.json repaired");
}

main().catch((error) => {
  console.error(String(error));
  process.exitCode = 1;
});
