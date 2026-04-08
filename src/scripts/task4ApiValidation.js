/* eslint-disable no-console */
const { performance } = require("perf_hooks");

const BASE_URL = process.env.BASE_URL || "https://capstone-pro-six.vercel.app";
const SLO_MS = Number(process.env.SLO_MS || 100);

function ensureTrailingSlashless(url) {
  return String(url || "").replace(/\/+$/, "");
}

function randomEmail(prefix = "task4") {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 100000)}@example.com`;
}

async function call(baseUrl, method, path, options = {}) {
  const headers = { ...(options.headers || {}) };
  const requestOptions = { method, headers };

  if (Object.prototype.hasOwnProperty.call(options, "body")) {
    headers["content-type"] = "application/json";
    requestOptions.body = JSON.stringify(options.body);
  }

  const start = performance.now();

  try {
    const response = await fetch(`${baseUrl}${path}`, requestOptions);
    const text = await response.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch (_err) {
      json = null;
    }

    return {
      ok: response.ok,
      status: response.status,
      ms: Math.round(performance.now() - start),
      text,
      json,
      headers: response.headers,
      error: "",
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      ms: Math.round(performance.now() - start),
      text: "",
      json: null,
      headers: new Headers(),
      error: String(err && err.message ? err.message : err),
    };
  }
}

function printSummary(results) {
  console.log("TASK4_TEST_SUMMARY");
  for (const row of results) {
    const cacheValue = row.cache ? ` cache=${row.cache}` : "";
    console.log(`${row.name} => status=${row.status} timeMs=${row.ms}${cacheValue}`);
  }

  const overSlo = results.filter((r) => r.ms > SLO_MS).length;
  console.log(`SLO_TARGET_MS ${SLO_MS}`);
  console.log(`RESPONSES_OVER_SLO ${overSlo} of ${results.length}`);
}

async function main() {
  const baseUrl = ensureTrailingSlashless(BASE_URL);
  const email = randomEmail();
  const password = "Pass@12345";
  const results = [];

  const health = await call(baseUrl, "GET", "/health");
  results.push({ name: "GET /health", status: health.status, ms: health.ms });
  if (!health.ok) {
    throw new Error(`Health check failed: status=${health.status} body=${health.text || health.error}`);
  }

  const register = await call(baseUrl, "POST", "/api/auth/register", {
    body: { email, password, role: "CLIENT" },
  });
  results.push({ name: "POST /api/auth/register", status: register.status, ms: register.ms });
  if (register.status !== 201) {
    throw new Error(`Register failed: status=${register.status} body=${register.text}`);
  }

  const login = await call(baseUrl, "POST", "/api/auth/login", {
    body: { email, password },
  });
  results.push({ name: "POST /api/auth/login", status: login.status, ms: login.ms });
  if (!login.ok || !login.json || !login.json.token) {
    throw new Error(`Login failed: status=${login.status} body=${login.text}`);
  }

  const jwtToken = login.json.token;
  const authHeaders = { authorization: `Bearer ${jwtToken}` };

  const createKey = await call(baseUrl, "POST", "/api/keys", {
    headers: authHeaders,
    body: {},
  });
  results.push({ name: "POST /api/keys", status: createKey.status, ms: createKey.ms });
  if (!createKey.ok || !createKey.json || !createKey.json.apiKey || !createKey.json.apiSecret) {
    throw new Error(`API key creation failed: status=${createKey.status} body=${createKey.text}`);
  }

  const apiHeaders = {
    "x-api-key": createKey.json.apiKey.key,
    "x-api-secret": createKey.json.apiSecret,
  };

  const states = await call(baseUrl, "GET", "/api/b2b/locations/states", {
    headers: apiHeaders,
  });
  results.push({
    name: "GET /api/b2b/locations/states",
    status: states.status,
    ms: states.ms,
    cache: states.headers.get("x-cache") || "NONE",
  });
  if (!states.ok || !Array.isArray(states.json && states.json.data) || states.json.data.length === 0) {
    throw new Error(`States failed: status=${states.status} body=${states.text}`);
  }

  const stateId = states.json.data[0].id;
  const districts = await call(baseUrl, "GET", `/api/b2b/locations/states/${stateId}/districts`, {
    headers: apiHeaders,
  });
  results.push({
    name: "GET /api/b2b/locations/states/:id/districts",
    status: districts.status,
    ms: districts.ms,
    cache: districts.headers.get("x-cache") || "NONE",
  });
  if (!districts.ok || !Array.isArray(districts.json && districts.json.data)) {
    throw new Error(`Districts failed: status=${districts.status} body=${districts.text}`);
  }

  const search = await call(baseUrl, "GET", "/api/b2b/locations/search?q=ram", {
    headers: apiHeaders,
  });
  results.push({ name: "GET /api/b2b/locations/search?q=ram", status: search.status, ms: search.ms });
  if (!search.ok || !Array.isArray(search.json && search.json.data)) {
    throw new Error(`Search failed: status=${search.status} body=${search.text}`);
  }

  printSummary(results);
  console.log(`SEARCH_RESULT_COUNT ${search.json.data.length}`);
  console.log("TASK4_RESULT PASS");
}

main().catch((err) => {
  console.error("TASK4_RESULT FAIL");
  console.error(err && err.message ? err.message : err);
  process.exit(1);
});
