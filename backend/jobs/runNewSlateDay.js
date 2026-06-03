/**
 * Midnight slate rollover (Wave 1) — Honolulu calendar day flip.
 *
 * Preloads today's shared snapshot layer so every client reads the same bucket
 * (schedule, odds, injuries, gamelogs, Savant, NRFI, board + card summaries).
 *
 * Authoritative refresh still runs at 10 AM HI + pregame (~95 min before first pitch).
 */

const { todayHonolulu } = require("../lib/cardSummaryKeys");
const {
  snapshotSlate,
  snapshotOdds,
  pollInjuries,
  snapshotPitcherGamelogs,
  snapshotBatterGamelogs,
  snapshotPitcherSavant,
  snapshotNrfiForSlate,
} = require("./snapshotJobs");
const { generateDailyAiSnapshot } = require("./dailyAiSnapshot");
const { tryGenerateDailyCardForJob } = require("../routes/dailyCard");

async function runStep(name, fn) {
  const started = Date.now();
  try {
    await fn();
    const ms = Date.now() - started;
    console.log(`  ✓ midnight-slate [${name}]  ${ms}ms`);
    return { step: name, ok: true, ms };
  } catch (err) {
    const ms = Date.now() - started;
    console.warn(`  ⚠ midnight-slate [${name}] failed (${ms}ms): ${err.message}`);
    return { step: name, ok: false, ms, error: err.message };
  }
}

/**
 * @param {object} [opts]
 * @param {string} [opts.date] — Honolulu YYYY-MM-DD (default: today)
 * @param {boolean} [opts.skipAi] — skip board/edges/summaries (facts-only wave)
 */
async function runNewSlateDay(opts = {}) {
  const slateDate = opts.date ?? todayHonolulu();
  const skipAi = opts.skipAi === true;

  console.log(`\n  ══ midnight slate rollover (Wave 1)  date=${slateDate} ══`);

  const steps = [];

  // Facts layer — order matters (schedule before gamelogs / NRFI / Savant)
  steps.push(await runStep("snapshotSlate", () => snapshotSlate(slateDate)));
  steps.push(await runStep("snapshotOdds", () => snapshotOdds(slateDate)));
  steps.push(await runStep("pollInjuries", () => pollInjuries(slateDate)));
  steps.push(await runStep("snapshotPitcherGamelogs", () => snapshotPitcherGamelogs(slateDate)));
  steps.push(await runStep("snapshotBatterGamelogs", () => snapshotBatterGamelogs(slateDate)));
  steps.push(await runStep("snapshotPitcherSavant", () => snapshotPitcherSavant(slateDate)));
  steps.push(await runStep("snapshotNrfiForSlate", () => snapshotNrfiForSlate(slateDate)));

  steps.push(await runStep("tryGenerateDailyCard", async () => {
    const r = await tryGenerateDailyCardForJob();
    if (r.skipped) return;
    if (!r.ok) throw new Error(r.error ?? "daily card failed");
  }));

  if (!skipAi) {
    if (!process.env.ANTHROPIC_API_KEY) {
      steps.push({
        step: "generateDailyAiSnapshot",
        ok: false,
        skipped: true,
        error: "ANTHROPIC_API_KEY not set",
      });
      console.warn("  ⚠ midnight-slate: skipping AI snapshot (no ANTHROPIC_API_KEY)");
    } else {
      steps.push(await runStep(
        "generateDailyAiSnapshot",
        () => generateDailyAiSnapshot("midnight-wave1")
      ));
    }
  }

  const failed = steps.filter((s) => !s.ok && !s.skipped);
  const ok = steps.filter((s) => s.ok).length;

  console.log(
    `  ══ midnight slate complete  date=${slateDate}  ok=${ok}/${steps.length}` +
    (failed.length ? `  failed=${failed.map((f) => f.step).join(", ")}` : "") +
    " ══\n"
  );

  return {
    ok: failed.length === 0,
    date: slateDate,
    label: "midnight-wave1",
    steps,
    note:
      "Early slate — board copy refreshes again at 10 AM HI and pregame. " +
      "All clients should read GET /api/board/snapshot and card_summaries for shared text.",
  };
}

module.exports = { runNewSlateDay };
