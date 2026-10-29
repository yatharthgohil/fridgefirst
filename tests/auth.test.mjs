import assert from "node:assert/strict";
import test from "node:test";

const baseUrl = process.env.TEST_BASE_URL || "http://localhost:3000";

test("signed-out visitors are redirected from the dashboard to login", async () => {
  const response = await fetch(new URL("/dashboard", baseUrl), {
    redirect: "manual",
    signal: AbortSignal.timeout(30_000),
  });

  assert.equal(response.status, 307);
  assert.equal(new URL(response.headers.get("location"), baseUrl).pathname, "/login");
});

test("an OAuth callback without a code returns to login with an error", async () => {
  const response = await fetch(new URL("/auth/callback", baseUrl), {
    redirect: "manual",
    signal: AbortSignal.timeout(30_000),
  });
  const destination = new URL(response.headers.get("location"), baseUrl);

  assert.equal(response.status, 307);
  assert.equal(destination.origin, new URL(baseUrl).origin);
  assert.equal(destination.pathname, "/login");
  assert.equal(destination.searchParams.get("error"), "auth");
  assert.match(response.headers.get("cache-control"), /no-store/);
});
