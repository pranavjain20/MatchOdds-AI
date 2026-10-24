"""Record real backend output for the web demo (frontend/src/demo).

The web demo has no server. It replays what this script records from a real
local backend, so visitors see genuine output:
- the saved games, each matchup's data, market consensus and similar games
- every analysis mode on every game, as the stream of trace lines it printed,
  with the time each line arrived
- the research results (summary, predictions, calibration, ablations)

Run against a local backend that has the data/ folder and an Anthropic key:
    DEMO_AS_OF=2026-05-04T12:00:00-04:00 uvicorn app.main:app --app-dir backend --port 8010
    python backend/scripts/export_web_demo.py

Writes frontend/src/demo/fixture.json. Runs each game in each mode once
(nine analyses, well under a dollar on Haiku).
"""

import argparse
import json
import time
from datetime import datetime, timezone
from pathlib import Path

import httpx

FIXTURE_PATH = Path(__file__).resolve().parents[2] / "frontend" / "src" / "demo" / "fixture.json"
MODES = ["multi_agent", "single_agent", "cot"]


def get(api: httpx.Client, path: str, **params):
    return api.get(f"/api{path}", params=params, timeout=120).raise_for_status().json()


def record_stream(api: httpx.Client, request: dict) -> list[dict]:
    """Every SSE event the analysis sent, each with the milliseconds since the start."""
    events = []
    start = time.monotonic()
    with api.stream("POST", "/api/analysis/stream", json=request, timeout=600) as response:
        response.raise_for_status()
        for line in response.iter_lines():
            if line.startswith("data:"):
                event = json.loads(line[5:].strip())
                events.append({"ms": round((time.monotonic() - start) * 1000), "event": event})
    if not events or events[-1]["event"].get("event") != "done":
        raise RuntimeError(f"{request['mode']} on {request['home_abbr']} did not finish: {events[-1:]}")
    return events


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--api", default="http://localhost:8010")
    args = parser.parse_args()
    api = httpx.Client(base_url=args.api)

    games = get(api, "/games/upcoming")
    matchups, consensus, similar, analyses = {}, {}, {}, {}
    for game in games:
        key = f"{game['home_team']}|{game['away_team']}"
        matchups[key] = get(api, "/games/matchup", home=game["home_team"], away=game["away_team"])
        consensus[key] = get(api, "/games/market-consensus", home=game["home_team"], away=game["away_team"])
        similar[f"{game['home_abbr']}|{game['away_abbr']}"] = get(
            api, "/games/similar", home_abbr=game["home_abbr"], away_abbr=game["away_abbr"],
        )
        for mode in MODES:
            request = {
                "mode": mode,
                "home_team": game["home_team"],
                "away_team": game["away_team"],
                "home_abbr": game["home_abbr"],
                "away_abbr": game["away_abbr"],
                "game_date": game["commence_time"][:10],
            }
            events = record_stream(api, request)
            analyses[f"{key}|{mode}"] = events
            print(f"{mode} on {game['label']}: {len(events)} events in {events[-1]['ms'] / 1000:.0f}s")

    fixture = {
        "captured_at": datetime.now(timezone.utc).isoformat(),
        "health": get(api, "/meta/health"),
        "teams": get(api, "/meta/teams"),
        "upcoming": games,
        "matchups": matchups,
        "market_consensus": consensus,
        "similar": similar,
        "analyses": analyses,
        "backtest": {
            "summary": get(api, "/backtest/summary"),
            "predictions": get(api, "/backtest/predictions"),
            "calibration": get(api, "/backtest/calibration"),
            "ablations": get(api, "/backtest/ablations"),
            "status": get(api, "/backtest/status"),
        },
        "pipelines": get(api, "/pipelines/status"),
    }
    FIXTURE_PATH.parent.mkdir(parents=True, exist_ok=True)
    FIXTURE_PATH.write_text(json.dumps(fixture, indent=1) + "\n")
    print(f"wrote {FIXTURE_PATH} ({FIXTURE_PATH.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
