import assert from "node:assert/strict";
import test from "node:test";

const baseUrl = process.env.TEST_BASE_URL || "http://localhost:3000";

test("login offers Google sign-in without rendering the demo dashboard", async () => {
  const response = await fetch(new URL("/login", baseUrl), {
    signal: AbortSignal.timeout(30_000),
  });
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Continue with Google/);
  assert.doesNotMatch(html, /alex@example\.com/);
});

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

test("a denied Google callback stays on this app and shows an auth error", async () => {
  const response = await fetch(new URL("/auth/callback?error=access_denied&next=https://example.com", baseUrl), {
    redirect: "manual",
    signal: AbortSignal.timeout(30_000),
  });
  const destination = new URL(response.headers.get("location"), baseUrl);
  assert.equal(response.status, 307);
  assert.equal(destination.origin, new URL(baseUrl).origin);
  assert.equal(destination.pathname, "/login");
  assert.equal(destination.searchParams.get("error"), "auth");
});
