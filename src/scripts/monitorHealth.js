/* eslint-disable no-console */
const { performance } = require("perf_hooks");

const BASE_URL = (process.env.BASE_URL || "https://capstone-pro-six.vercel.app").replace(/\/+$/, "");
const PATHNAME = process.env.HEALTH_PATH || "/health";
const INTERVAL_MS = Number(process.env.MONITOR_INTERVAL_MS || 60000);
const ITERATIONS = Number(process.env.MONITOR_ITERATIONS || 5);

async function checkOnce(index) {
  const startedAt = new Date().toISOString();
  const t0 = performance.now();

  try {
    const response = await fetch(`${BASE_URL}${PATHNAME}`);
    const body = await response.text();
    const latency = Math.round(performance.now() - t0);
    console.log(
      `#${index} ts=${startedAt} status=${response.status} latencyMs=${latency} body=${body.slice(0, 120)}`
    );
  } catch (err) {
    const latency = Math.round(performance.now() - t0);
    console.log(`#${index} ts=${startedAt} status=0 latencyMs=${latency} error=${String(err)}`);
  }
}

async function sleep(ms) {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function main() {
  console.log(
    `MONITOR_START baseUrl=${BASE_URL} path=${PATHNAME} intervalMs=${INTERVAL_MS} iterations=${ITERATIONS}`
  );

  for (let i = 1; i <= ITERATIONS; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await checkOnce(i);
    if (i < ITERATIONS) {
      // eslint-disable-next-line no-await-in-loop
      await sleep(INTERVAL_MS);
    }
  }

  console.log("MONITOR_DONE");
}

main().catch((err) => {
  console.error("MONITOR_FAIL", err && err.message ? err.message : err);
  process.exit(1);
});
