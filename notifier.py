import json
import os
import re
import smtplib
import ssl
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from email.mime.text import MIMEText
from pathlib import Path
from typing import Any


BASE_DIR = Path(__file__).resolve().parent
STATE_DIR = BASE_DIR / ".state"
STATE_FILE = STATE_DIR / "notifier_state.json"

BREAKOUTS_URL = "https://crazyrich.ai/zh/breakouts"
BREAKOUTS_API_URL = "https://crazyrich.ai/api/claw/breakouts"
SOURCES_URL = "https://crazyrich.ai/zh/research/sources"
USER_AGENT = "Mozilla/5.0 (compatible; CrazyRichNotifier/1.0)"


@dataclass
class BreakoutEvent:
    ticker: str
    signal: str
    setup: str
    score: str
    entry: str
    current: str
    signal_close: str
    layer: str
    alert_date: str


@dataclass
class SourceSignal:
    handle: str
    hit_rate: float | None
    alpha_hit_rate: float | None
    edge_score: float | None
    signal_type: str | None
    ticker: str
    bias: str
    thesis: str


def fetch_text(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=30) as response:
        return response.read().decode("utf-8", errors="replace")


def fetch_json(url: str) -> Any:
    return json.loads(fetch_text(url))


def clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def load_state() -> dict[str, Any]:
    if not STATE_FILE.exists():
        return {"breakouts": [], "source_signals": []}
    return json.loads(STATE_FILE.read_text(encoding="utf-8-sig"))


def save_state(state: dict[str, Any]) -> None:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")


def extract_next_push_strings(html: str) -> list[str]:
    return re.findall(r'self\.__next_f\.push\(\[1,"(.*?)"\]\)</script>', html, re.S)


def decode_push_blob(blob: str) -> str:
    return bytes(blob, "utf-8").decode("unicode_escape", errors="replace")


def parse_breakouts(payload: dict[str, Any]) -> list[BreakoutEvent]:
    events: list[BreakoutEvent] = []
    for item in payload.get("signals", []):
        events.append(
            BreakoutEvent(
                ticker=str(item.get("ticker", "-")),
                signal=str(item.get("signal_type", "-")),
                setup=str(item.get("setup_type", "-")),
                score=str(item.get("quality_score", "-")),
                entry=str(item.get("ref_price", "-")),
                current=str(item.get("latest_close", "-")),
                signal_close=str(item.get("signal_close", "-")),
                layer=str(item.get("layer", "-")),
                alert_date=str(item.get("alert_date", "-")),
            )
        )
    return events


def parse_source_rankings(html: str) -> dict[str, dict[str, Any]]:
    text = decode_push_blob("\n".join(extract_next_push_strings(html)))
    matches = re.findall(
        r'"source_handle":"([^"]+)".*?"hit_rate_any_horizon":(null|-?\d+(?:\.\d+)?).*?'
        r'"alpha_hit_rate":(null|-?\d+(?:\.\d+)?).*?"edge_score":(null|-?\d+(?:\.\d+)?).*?'
        r'"best_signal_type":(null|"[^"]+")',
        text,
        re.S,
    )
    rankings: dict[str, dict[str, Any]] = {}
    for handle, hit_rate, alpha_hit_rate, edge_score, signal_type in matches:
        rankings[handle.lower()] = {
            "hit_rate": None if hit_rate == "null" else round(float(hit_rate) * 100, 1),
            "alpha_hit_rate": None if alpha_hit_rate == "null" else round(float(alpha_hit_rate) * 100, 1),
            "edge_score": None if edge_score == "null" else round(float(edge_score), 2),
            "signal_type": None if signal_type == "null" else signal_type.strip('"'),
        }
    return rankings


def parse_source_signals(html: str) -> list[SourceSignal]:
    text = decode_push_blob("\n".join(extract_next_push_strings(html)))
    rankings = parse_source_rankings(html)

    section_match = re.search(r"### \u4fe1\u53f7\u7c3f(.*?)(?:### |\Z)", text, re.S)
    section = section_match.group(1) if section_match else text
    rows = re.findall(r"\|\s*\*\*([^*]+)\*\*\s*\|\s*([^|]+)\|\s*([^|]+)\|\s*([^|]+)\|", section)

    results: list[SourceSignal] = []
    for ticker, bias, source, thesis in rows:
        handle = clean_text(source).lstrip("@")
        meta = rankings.get(handle.lower(), {})
        hit_rate = meta.get("hit_rate")
        alpha_hit_rate = meta.get("alpha_hit_rate")
        if (hit_rate or 0) < 70 and (alpha_hit_rate or 0) < 70:
            continue
        results.append(
            SourceSignal(
                handle=f"@{handle}",
                hit_rate=hit_rate,
                alpha_hit_rate=alpha_hit_rate,
                edge_score=meta.get("edge_score"),
                signal_type=meta.get("signal_type"),
                ticker=clean_text(ticker),
                bias=clean_text(bias),
                thesis=clean_text(thesis),
            )
        )
    return results


def breakout_key(item: BreakoutEvent) -> str:
    return "|".join([item.ticker, item.signal, item.setup, item.entry, item.alert_date])


def source_signal_key(item: SourceSignal) -> str:
    return "|".join([item.handle, item.ticker, item.bias, item.thesis])


def diff_items(current: list[Any], old_keys: set[str], key_fn) -> list[Any]:
    return [item for item in current if key_fn(item) not in old_keys]


def format_message(breakouts: list[BreakoutEvent], source_signals: list[SourceSignal]) -> str:
    lines = [
        "CrazyRich daily digest",
        "",
        f"Generated: {datetime.now(timezone.utc).astimezone().strftime('%Y-%m-%d %H:%M %Z')}",
        "",
        "1. New breakouts / strong / trim / exit items",
    ]

    if not breakouts:
        lines.append("- No new breakout lifecycle events found today.")
    else:
        for item in breakouts:
            lines.append(
                f"- {item.alert_date} | {item.ticker} | {item.signal} | {item.setup} | score {item.score} | entry {item.entry} | latest {item.current} | signal_close {item.signal_close} | layer {item.layer}"
            )

    lines.extend(["", "2. New opinion changes from high-hit-rate sources"])
    if not source_signals:
        lines.append("- No new qualifying source opinion changes found today.")
    else:
        for item in source_signals:
            lines.append(
                f"- {item.handle} | {item.ticker} | {item.bias} | hit {item.hit_rate or '-'}% | alpha hit {item.alpha_hit_rate or '-'}% | edge {item.edge_score or '-'} | {item.thesis}"
            )

    lines.extend(["", f"Breakouts page: {BREAKOUTS_URL}", f"Sources page: {SOURCES_URL}"])
    return "\n".join(lines)


def send_feishu(message: str) -> None:
    webhook = os.getenv("FEISHU_WEBHOOK_URL")
    if not webhook:
        return
    payload = json.dumps({"msg_type": "text", "content": {"text": message}}).encode("utf-8")
    req = urllib.request.Request(
        webhook,
        data=payload,
        headers={"Content-Type": "application/json; charset=utf-8", "User-Agent": USER_AGENT},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as response:
        response.read()


def send_email(message: str) -> None:
    host = os.getenv("SMTP_HOST")
    port = int(os.getenv("SMTP_PORT", "465"))
    username = os.getenv("SMTP_USERNAME")
    password = os.getenv("SMTP_PASSWORD")
    sender = os.getenv("EMAIL_FROM")
    recipient = os.getenv("EMAIL_TO")
    if not all([host, username, password, sender, recipient]):
        return

    email = MIMEText(message, "plain", "utf-8")
    email["Subject"] = os.getenv("EMAIL_SUBJECT", "CrazyRich daily digest")
    email["From"] = sender
    email["To"] = recipient

    context = ssl.create_default_context()
    with smtplib.SMTP_SSL(host, port, context=context) as server:
        server.login(username, password)
        server.sendmail(sender, [recipient], email.as_string())


def main() -> int:
    try:
        breakouts_payload = fetch_json(BREAKOUTS_API_URL)
        sources_html = fetch_text(SOURCES_URL)
    except urllib.error.URLError as exc:
        print(f"Failed to fetch remote pages: {exc}", file=sys.stderr)
        return 1

    current_breakouts = parse_breakouts(breakouts_payload)
    current_source_signals = parse_source_signals(sources_html)

    state = load_state()
    old_breakouts = set(state.get("breakouts", []))
    old_source_signals = set(state.get("source_signals", []))

    new_breakouts = diff_items(current_breakouts, old_breakouts, breakout_key)
    new_source_signals = diff_items(current_source_signals, old_source_signals, source_signal_key)

    message = format_message(new_breakouts, new_source_signals)
    print(message)

    send_feishu(message)
    send_email(message)

    save_state(
        {
            "breakouts": [breakout_key(item) for item in current_breakouts],
            "source_signals": [source_signal_key(item) for item in current_source_signals],
        }
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
