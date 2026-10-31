// After a stream dropped mid-run, the server still finishes and saves the run. Instead of starting a new
// (possibly paid) run, poll the saved history briefly for a run newer than the ones known at start.

const delay = (ms) => new Promise((r) => setTimeout(r, ms))

/** Newest run in `history` with an id above `sinceId`, or null. */
export function newestAfter(history, sinceId) {
  const newer = (history ?? []).filter((a) => Number(a.id) > Number(sinceId ?? 0))
  return newer.sort((a, b) => Number(b.id) - Number(a.id))[0] ?? null
}

/** Polls `loadHistory()` until a run newer than `sinceId` appears; null after `tries` attempts. */
export async function waitForNewRun(loadHistory, sinceId, { tries = 15, intervalMs = 2000, sleep = delay } = {}) {
  for (let i = 0; i < tries; i++) {
    const found = newestAfter(await loadHistory(), sinceId)
    if (found) return found
    if (i < tries - 1) await sleep(intervalMs)
  }
  return null
}
