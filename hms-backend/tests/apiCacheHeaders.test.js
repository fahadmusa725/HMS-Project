/**
 * Private API responses must never be storable.
 *
 * Two users share a browser and a CDN sits in front of the deployment, so a stored response is a
 * cross-session leak waiting to happen: a heuristic-cached (or CDN-cached) 200 from hospital A is
 * exactly what hospital B's client would paint before its own request lands. These assertions pin
 * the three parts of the contract: no-store, Vary: Authorization, and no ETag - so a conditional
 * request can never be answered 304 from a validator another session was handed.
 */
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");

const { startTestServer, stopTestServer, resetDatabase } = require("./helpers/harness");
const { createTenant } = require("./helpers/factories");

let request;
let hospitalA;
let hospitalB;

const asA = () => hospitalA.tokens.hospital_admin;
const asB = () => hospitalB.tokens.hospital_admin;

before(async () => {
  request = await startTestServer();
  await resetDatabase();
  hospitalA = await createTenant({ name: "Cache Header Hospital A" });
  hospitalB = await createTenant({ name: "Cache Header Hospital B" });
});

after(async () => {
  await stopTestServer();
});

test("an authenticated read carries no-store, Vary: Authorization and no ETag", async () => {
  const response = await request.get("/api/auth/me").set("Authorization", asA());

  assert.equal(response.status, 200);
  assert.match(response.headers["cache-control"] || "", /no-store/);
  assert.match(response.headers.vary || "", /authorization/i);
  assert.equal(response.headers.etag, undefined, "no validator may be handed to a private client");
});

test("the same headers cover every module, not just /auth", async () => {
  for (const path of ["/api/hospital-admin/settings", "/api/patients", "/api/appointments/queue"]) {
    const response = await request.get(path).set("Authorization", asA());
    assert.equal(response.status, 200, `${path} -> ${response.status}`);
    assert.match(response.headers["cache-control"] || "", /no-store/, path);
    assert.match(response.headers.vary || "", /authorization/i, path);
  }
});

test("a validator from one session cannot answer another session with a 304", async () => {
  const first = await request.get("/api/hospital-admin/settings").set("Authorization", asA());
  assert.equal(first.status, 200);

  const second = await request
    .get("/api/hospital-admin/settings")
    .set("Authorization", asB())
    .set("If-None-Match", first.headers.etag || 'W/"a-response-from-the-other-session"');

  assert.equal(second.status, 200, "a revalidation must never short-circuit into 304");
  assert.equal(second.body.name, "Cache Header Hospital B", "and the body is this session's hospital");
});

test("the public waiting-room display keeps its short public cache and no patient data", async () => {
  const key = hospitalA.hospital.settings.displayKey;
  const response = await request.get(`/api/public/display/${hospitalA.hospital._id}`).query({ key });

  assert.equal(response.status, 200);
  assert.equal(response.headers["cache-control"], "public, max-age=5");
  assert.doesNotMatch(JSON.stringify(response.body), /patient|mrn/i);
});

test("the public signup list is not storable either", async () => {
  const response = await request.get("/api/public/hospitals");

  assert.equal(response.status, 200);
  assert.match(response.headers["cache-control"] || "", /no-store/);
});
