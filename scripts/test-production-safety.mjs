const BASE_URL =
  process.env.AUTOPILOT_PRODUCTION_URL ??
  "https://amazon-ai-autopilot-production.up.railway.app";

let passed = 0;
let failed = 0;

async function check(name, fn) {
  try {
    const result = await fn();

    if (result.ok) {
      console.log(`? [PASS] ${name}`);
      passed++;
    } else {
      console.error(`? [FAIL] ${name}`);
      console.error(`   ${result.message ?? "Unexpected response"}`);
      failed++;
    }
  } catch (error) {
    console.error(`? [FAIL] ${name}`);
    console.error(
      `   ${error instanceof Error ? error.message : String(error)}`
    );
    failed++;
  }
}

async function status(path) {
  const response = await fetch(`${BASE_URL}${path}`, {
    redirect: "manual",
  });

  return response.status;
}

console.log("");
console.log("==================================================");
console.log(" AMAZON AI AUTOPILOT PRODUCTION SAFETY GATE");
console.log("==================================================");
console.log(`Target: ${BASE_URL}`);
console.log("");

await check("Health endpoint is publicly healthy", async () => {
  const response = await fetch(`${BASE_URL}/api/health`);
  const body = await response.json();

  return {
    ok:
      response.status === 200 &&
      body.status === "OK" &&
      body.database?.status === "HEALTHY",
    message: `HTTP ${response.status}`,
  };
});

await check("Dashboard rejects unauthenticated access", async () => {
  const code = await status("/api/dashboard");

  return {
    ok: code === 401,
    message: `Expected 401, received ${code}`,
  };
});

await check("Recommendations rejects unauthenticated access", async () => {
  const code = await status("/api/recommendations");

  return {
    ok: code === 401,
    message: `Expected 401, received ${code}`,
  };
});

await check("Settings rejects unauthenticated access", async () => {
  const code = await status("/api/settings");

  return {
    ok: code === 401,
    message: `Expected 401, received ${code}`,
  };
});

await check("Cron rejects requests without secret", async () => {
  const code = await status("/api/cron/autopilot");

  return {
    ok: code === 401,
    message: `Expected 401, received ${code}`,
  };
});

await check("Login page is publicly reachable", async () => {
  const code = await status("/login");

  return {
    ok: code === 200,
    message: `Expected 200, received ${code}`,
  };
});

console.log("");
console.log("==================================================");
console.log(` PASSED: ${passed}`);
console.log(` FAILED: ${failed}`);
console.log("==================================================");

if (failed > 0) {
  process.exit(1);
}

console.log("?? PRODUCTION SAFETY GATE PASSED");
