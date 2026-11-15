/**
 * Hospital branding: the hospital admin's own name and logo.
 *
 * Cloudinary is stubbed BEFORE src/app.js is required - the controller destructures these two
 * helpers at require time, so replacing them on the module object now is what the routes will
 * call. Without credentials the real uploader refuses to run, and a test must never touch the
 * network, but the upload/replace/remove bookkeeping is exactly what needs proving here.
 */
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");

const { startTestServer, stopTestServer, resetDatabase } = require("./helpers/harness");
const { createTenant, createHospital, createSuperAdmin, waitFor } = require("./helpers/factories");

const uploadedAssets = [];
const deletedAssets = [];

const cloudinaryUpload = require("../src/utils/uploadBufferToCloudinary");
cloudinaryUpload.uploadBufferToCloudinary = async (buffer, { folder }) => {
  const publicId = `${folder}/logo-${uploadedAssets.length + 1}`;
  const asset = { public_id: publicId, secure_url: `https://res.example.test/${publicId}.png` };
  uploadedAssets.push({ asset, byteLength: buffer.length });
  return asset;
};

const cloudinaryAssets = require("../src/utils/cloudinaryAssets");
cloudinaryAssets.destroyAsset = async ({ publicId, type }) => {
  deletedAssets.push({ publicId, type });
  return true;
};

const Hospital = require("../src/models/Hospital");
const AuditLog = require("../src/models/AuditLog");

const PNG_BYTES = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from("hospital-branding-test", "latin1"),
]);
const JPG_BYTES = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.from("hospital-branding-test", "latin1"),
]);
const SVG_BYTES = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg"><rect width="8" height="8"/></svg>',
  "utf8"
);
const GIF_BYTES = Buffer.from("GIF89a-branding-test", "latin1");
const PDF_BYTES = Buffer.from("%PDF-1.4 not-a-logo", "latin1");

let request;
let tenant;
let superAdminToken;

const asAdmin = () => tenant.tokens.hospital_admin;

function auditEntry(action) {
  return AuditLog.findOne({ hospitalId: tenant.hospital._id, action })
    .setOptions({ skipTenantScope: true })
    .lean();
}

before(async () => {
  request = await startTestServer();
  await resetDatabase();
  tenant = await createTenant({ name: "Branding Test Hospital" });
  const superAdmin = await createSuperAdmin();
  superAdminToken = superAdmin.token;
});

after(async () => {
  await stopTestServer();
});

test("a hospital admin renames the hospital and the rename is audited with both names", async () => {
  const response = await request
    .patch("/api/hospital-admin/settings")
    .set("Authorization", asAdmin())
    .send({ name: "  Sunrise Multispecialty Hospital  " });

  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal(response.body.name, "Sunrise Multispecialty Hospital");

  const stored = await Hospital.findById(tenant.hospital._id).lean();
  assert.equal(stored.name, "Sunrise Multispecialty Hospital");

  const settings = await request.get("/api/hospital-admin/settings").set("Authorization", asAdmin());
  assert.equal(settings.status, 200);
  assert.equal(settings.body.name, "Sunrise Multispecialty Hospital");

  const entry = await waitFor(() => auditEntry("Renamed the hospital"));
  assert.ok(entry, "the rename produced an audit row");
  assert.equal(entry.details, 'Name "Branding Test Hospital" -> "Sunrise Multispecialty Hospital"');
  assert.equal(entry.userRole, "hospital_admin");
});

test("the hospital name is validated before it is saved", async () => {
  const before = await Hospital.findById(tenant.hospital._id).lean();

  for (const name of ["", "   ", "A", "x".repeat(81)]) {
    const response = await request
      .patch("/api/hospital-admin/settings")
      .set("Authorization", asAdmin())
      .send({ name });

    assert.equal(response.status, 400, `${JSON.stringify(name)} must be rejected`);
  }

  const after = await Hospital.findById(tenant.hospital._id).lean();
  assert.equal(after.name, before.name);
});

test("a rename cannot collide with another hospital, case-insensitively", async () => {
  await createHospital({ name: "Riverside Care Hospital" });

  const response = await request
    .patch("/api/hospital-admin/settings")
    .set("Authorization", asAdmin())
    .send({ name: "riverside care hospital" });

  assert.equal(response.status, 409);
  assert.equal(response.body.message, "Another hospital already uses that name.");

  const stored = await Hospital.findById(tenant.hospital._id).lean();
  assert.equal(stored.name, "Sunrise Multispecialty Hospital");
});

test("only a hospital admin can change the name or the logo", async () => {
  const doctor = tenant.tokens.doctor;

  const rename = await request
    .patch("/api/hospital-admin/settings")
    .set("Authorization", doctor)
    .send({ name: "Hijacked Hospital" });
  assert.equal(rename.status, 403);

  const upload = await request
    .post("/api/hospital-admin/settings/logo")
    .set("Authorization", doctor)
    .attach("logo", PNG_BYTES, "logo.png");
  assert.equal(upload.status, 403);

  const remove = await request
    .delete("/api/hospital-admin/settings/logo")
    .set("Authorization", doctor);
  assert.equal(remove.status, 403);

  const stored = await Hospital.findById(tenant.hospital._id).lean();
  assert.equal(stored.name, "Sunrise Multispecialty Hospital");
  assert.equal(stored.logoUrl, "");
});

test("the logo is refused unless its bytes are a PNG or a JPG", async () => {
  const cases = [
    ["logo.svg", SVG_BYTES],
    ["logo.gif", GIF_BYTES],
    ["logo.pdf", PDF_BYTES],
  ];

  for (const [filename, bytes] of cases) {
    const response = await request
      .post("/api/hospital-admin/settings/logo")
      .set("Authorization", asAdmin())
      .attach("logo", bytes, filename);

    assert.equal(response.status, 400, `${filename} must be refused`);
    assert.equal(response.body.message, "The logo must be a PNG or JPG image.");
  }

  const noFile = await request
    .post("/api/hospital-admin/settings/logo")
    .set("Authorization", asAdmin());
  assert.equal(noFile.status, 400);

  const stored = await Hospital.findById(tenant.hospital._id).lean();
  assert.equal(stored.logoUrl, "");
  assert.equal(uploadedAssets.length, 0, "nothing reaches Cloudinary for a rejected file");
});

test("a logo is stored in the hospital's own folder and a replacement deletes the old asset", async () => {
  const first = await request
    .post("/api/hospital-admin/settings/logo")
    .set("Authorization", asAdmin())
    .attach("logo", PNG_BYTES, "logo.png");

  assert.equal(first.status, 200, JSON.stringify(first.body));
  const afterFirst = await Hospital.findById(tenant.hospital._id).lean();
  assert.equal(afterFirst.logoUrl, first.body.logoUrl);
  assert.ok(
    afterFirst.logoPublicId.startsWith(`hms-branding/${tenant.hospital._id}/`),
    `logo lives under the hospital folder, got ${afterFirst.logoPublicId}`
  );
  assert.equal(uploadedAssets[0].byteLength, PNG_BYTES.length);

  const second = await request
    .post("/api/hospital-admin/settings/logo")
    .set("Authorization", asAdmin())
    .attach("logo", JPG_BYTES, "logo.jpg");

  assert.equal(second.status, 200, JSON.stringify(second.body));
  assert.notEqual(second.body.logoUrl, first.body.logoUrl);
  assert.ok(
    deletedAssets.some(
      (asset) => asset.publicId === afterFirst.logoPublicId && asset.type === "upload"
    ),
    "the replaced asset is deleted as a public upload"
  );

  const logged = await waitFor(async () => {
    const count = await AuditLog.countDocuments({
      hospitalId: tenant.hospital._id,
      action: "Updated the hospital logo",
    }).setOptions({ skipTenantScope: true });
    return count >= 2 ? count : null;
  });
  assert.equal(logged, 2, "both uploads are audited");
});

test("the super admin list shows the current name and logo", async () => {
  const response = await request
    .get("/api/super-admin/hospitals")
    .set("Authorization", superAdminToken);

  assert.equal(response.status, 200);
  const list = Array.isArray(response.body) ? response.body : response.body.hospitals;
  const row = list.find((hospital) => String(hospital._id) === String(tenant.hospital._id));

  assert.ok(row, "the renamed hospital is listed");
  assert.equal(row.name, "Sunrise Multispecialty Hospital");

  const stored = await Hospital.findById(tenant.hospital._id).lean();
  assert.equal(row.logoUrl, stored.logoUrl);
  assert.ok(row.logoUrl, "the thumbnail has a URL to render");
});

test("a logo larger than 1 MB is refused before it reaches storage", async () => {
  const oversized = Buffer.concat([PNG_BYTES, Buffer.alloc(1024 * 1024)]);
  const response = await request
    .post("/api/hospital-admin/settings/logo")
    .set("Authorization", asAdmin())
    .attach("logo", oversized, "huge.png");

  assert.equal(response.status, 400);
  assert.equal(response.body.message, "The logo must be 1 MB or smaller.");
});

test("removing the logo clears it, deletes the asset and is audited", async () => {
  const before = await Hospital.findById(tenant.hospital._id).lean();
  assert.ok(before.logoPublicId, "a logo is in place to remove");

  const response = await request
    .delete("/api/hospital-admin/settings/logo")
    .set("Authorization", asAdmin());

  assert.equal(response.status, 200);
  assert.equal(response.body.logoUrl, "");

  const after = await Hospital.findById(tenant.hospital._id).lean();
  assert.equal(after.logoUrl, "");
  assert.equal(after.logoPublicId, "");
  assert.ok(
    deletedAssets.some((asset) => asset.publicId === before.logoPublicId && asset.type === "upload"),
    "the removed asset is deleted as a public upload"
  );

  const entry = await waitFor(() => auditEntry("Removed the hospital logo"));
  assert.ok(entry, "the removal is audited");
});
