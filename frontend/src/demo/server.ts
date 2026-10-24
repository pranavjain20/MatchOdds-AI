/**
 * The demo's stand-in for the FastAPI backend: same routes, same responses,
 * answered from fixture.json, which backend/scripts/export_web_demo.py
 * recorded from the real backend. Analyses replay the trace lines the real
 * agents printed, in order, sped up so the longest takes about 20 seconds.
 */

import fixture from "./fixture.json";

type Recorded = { ms: number; event: { event: string; [key: string]: unknown } };

/** The longest replay in milliseconds; shorter analyses are sped up by the same factor. */
const MAX_REPLAY_MS = 20_000;
/** Compare All runs three analyses back to back, so each waits at most this long. */
const MAX_RUN_MS = 6_000;
const TURNED_OFF =
  "This demo shows saved results from last season. Fetching new data and running new backtests is turned off.";

const analyses = fixture.analyses as unknown as Record<string, Recorded[]>;
const speedUp = Math.max(
  1,
  ...Object.values(analyses).map((events) => events[events.length - 1].ms / MAX_REPLAY_MS),
);

const aborted = () => new DOMException("The request was aborted", "AbortError");

/** Waits like setTimeout, but rejects as soon as the request is cancelled, as fetch does. */
const sleep = (ms: number, signal?: AbortSignal | null) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(aborted());
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => (clearTimeout(timer), reject(aborted())), {
      once: true,
    });
  });

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const notFound = (what: string) => json({ detail: `${what} isn't in this demo` }, 404);

function recording(body: Record<string, string>): Recorded[] | undefined {
  return analyses[`${body.home_team}|${body.away_team}|${body.mode}`];
}

/** The SSE stream /analysis/stream sent, replayed with the recorded spacing.
 *  Cancelling the request (a new run, another game) stops it, as on the real backend. */
function replayStream(events: Recorded[], signal?: AbortSignal | null): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let previous = 0;
      try {
        for (const { ms, event } of events) {
          await sleep((ms - previous) / speedUp, signal);
          previous = ms;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream" } });
}

/** /analysis/run returns what the stream's final "done" event carried. */
async function replayRun(events: Recorded[]): Promise<Response> {
  const last = events[events.length - 1];
  await sleep(Math.min(last.ms / speedUp, MAX_RUN_MS));
  return json({ report: last.event.report, raw: last.event.raw, trace: last.event.trace });
}

export async function demoFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const url = new URL(String(input), window.location.origin);
  const path = url.pathname.replace(/^.*?\/api/, "");
  const q = (name: string) => url.searchParams.get(name) ?? "";
  const method = (init.method ?? "GET").toUpperCase();
  const body = typeof init.body === "string" ? JSON.parse(init.body) : {};

  if (method === "POST") {
    if (path === "/analysis/stream" || path === "/analysis/run") {
      const events = recording(body);
      if (!events) return notFound("That analysis");
      return path === "/analysis/stream"
        ? replayStream(events, init.signal)
        : replayRun(events);
    }
    if (path.startsWith("/pipelines/") || path === "/backtest/run") {
      return json({ detail: TURNED_OFF }, 403);
    }
    return notFound("That action");
  }

  switch (path) {
    case "/meta/health":
      return json(fixture.health);
    case "/meta/teams":
      return json(fixture.teams);
    case "/games/upcoming":
      return json(fixture.upcoming);
    case "/games/matchup":
      return json((fixture.matchups as Record<string, unknown>)[`${q("home")}|${q("away")}`] ?? null);
    case "/games/market-consensus":
      return json(
        (fixture.market_consensus as Record<string, unknown>)[`${q("home")}|${q("away")}`] ?? null,
      );
    case "/games/similar":
      return json(
        (fixture.similar as Record<string, unknown>)[`${q("home_abbr")}|${q("away_abbr")}`] ?? [],
      );
    case "/backtest/summary":
      return json(fixture.backtest.summary);
    case "/backtest/predictions":
      return json(fixture.backtest.predictions);
    case "/backtest/calibration":
      return json(fixture.backtest.calibration);
    case "/backtest/ablations":
      return json(fixture.backtest.ablations);
    case "/backtest/status":
      return json(fixture.backtest.status);
    case "/pipelines/status":
      return json(fixture.pipelines);
  }
  return notFound("That page");
}
