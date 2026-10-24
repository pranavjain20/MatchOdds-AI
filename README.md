# MatchOdds AI

MatchOdds AI previews an NBA game: it pulls together the data that matters before tip-off, estimates each team's chance of winning, compares that with the bookmakers' odds, and explains its reasoning. We also used it as a research project, to test which kind of AI setup makes the best prediction from the same evidence.

Try the demo in your browser: [matchodds-ai.vercel.app](https://matchodds-ai.vercel.app) · Read the full report: [report.pdf](report.pdf)

Built by Pranav Jain, Aaditya Pai and Tanish Patel for STAT GR5293 (Generative AI Using LLMs) at Columbia, Spring 2026.

## The problem

Before any NBA game, predicting the winner means digging through scattered sources: injury reports, recent form, head-to-head records, rest days, fan and news sentiment, and what the bookmakers think. Our first instinct was to build an AI that pulls the important sources together and gives the best prediction it can.

Once it worked, we turned it into a research question. The common belief is that more elaborate AI setups reason better, for example several agents debating each other. Does more elaborate reasoning actually make better predictions when every setup gets the same evidence?

## How it works

Six data pipelines feed the system: game logs, team stats, standings and head-to-head records from `nba_api` across nine seasons; current injury reports; cross-sportsbook odds from The Odds API, with a Kaggle dataset for past games; ESPN and CBS articles; YouTube and Reddit comments, scored for sentiment; and a ChromaDB vector database of past games, so the AI can look up games played in similar situations (back-to-backs, rest days, home or away). Six tool functions expose this data, and every one accepts an `as_of_date`, so a past game only ever sees what was known before it started.

The same tools feed three ways of reasoning:

- **Chain-of-thought** (`nba_cot_baseline.py`). All the evidence is gathered up front, and the model reasons through it once, step by step, like a person reading a full briefing before deciding.
- **A single agent** (`nba_agent.py`). The model decides for itself which tool to call next, reads the result and keeps going until it's ready to answer. This is the ReAct pattern most AI agents use today.
- **A debate** (`nba_multi_agent.py`). A stats analyst, a matchup analyst and a market analyst each see only their own tools. Over two rounds they read each other's reasoning and revise, and a moderator writes the final call. We picked this because [Du et al. (ICML 2024)](https://arxiv.org/abs/2305.14325) found that models critiquing each other over several rounds reason more accurately.

Each one returns a report with win probabilities, the key factors, a comparison with the bookmakers and similar past games. The app is a React frontend on a FastAPI backend that streams each analysis's reasoning as it runs.

## What we found

We ran all three on 150 games from the 2024–25 season (132 had enough history to score) with Claude Haiku 4.5 and scored them with the Brier score, which rewards confident correct predictions and punishes confident wrong ones (lower is better, and a coin flip scores 0.25). We also measured accuracy, log loss and calibration, which checks whether "70% likely" really happens about 70% of the time.

- **The simplest setup won on every measure.** Chain-of-thought scored 0.228 and picked the winner 61% of the time. The single agent (0.297) and the debate (0.283) both did worse than a coin flip, and the debate used about three quarters of the $26 budget.
- **The agents reasoned well and then wrote the answer down wrong.** Reading the reports by hand, the agents usually argued for the right team, but their final answer often put the winning probability on the wrong team, mixing up home and away. The debate writes an answer many times per game, so it had the most chances to flip one.
- **Agreement made the debate overconfident.** When all three agents settled on a big favourite (80% or more), that team won only one game in five.
- **More information didn't help.** Games with more coverage were slightly harder to predict, not easier.
- **Only sources with real history mattered.** Turning off head-to-head records, team stats or the similar-games search made predictions worse. The sources we couldn't snapshot for past dates (injuries, news, odds, comments) made no real difference in the backtest.

[RESULTS.md](RESULTS.md) has every number, and [report.pdf](report.pdf) has the full write-up.

## Running it

You need Python 3.12, Node 18 or newer, and an Anthropic API key. The odds and YouTube pipelines need their own free keys, and the injury pipeline needs Java (`brew install openjdk@18` on a Mac).

```bash
python3.12 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt -r backend/requirements.txt
cp .env.example .env                 # ANTHROPIC_API_KEY, ODDS_API_KEY, YOUTUBE_API_KEY

python nba_data_pipeline.py          # game logs and stats (about an hour, rate-limited)
python nba_vector_store.py           # the similar-games database
python nba_odds_pipeline.py          # today's odds

uvicorn app.main:app --app-dir backend --port 8000
cd frontend && npm ci && npm run dev # http://localhost:5173
```

To rerun the experiment:

```bash
python nba_backtest.py --n-games 5 --season 2024-25        # a quick check
python nba_backtest.py --n-games 150 --season 2024-25      # the full run (about 17 hours, about $26)
python nba_backtest.py --n-games 150 --season 2024-25 --disable-source h2h --methods chain_of_thought
```

Results are cached per game and method, so an interrupted run picks up where it stopped.

The browser demo replays output recorded from the real backend. `python backend/scripts/export_web_demo.py` records it from a running backend, and `npm run build:demo` in `frontend/` builds it.
