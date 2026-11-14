/**
 * Test harness: one in-memory MongoDB per test file, the real Express app, and an
 * email transport stub so signup/reset flows can be asserted end to end.
 *
 * The app is required only after the environment is set, because src/app.js validates
 * MONGO_URI/JWT_SECRET/CLIENT_URL at require time.
 */
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "careflow-test-secret-0123456789abcdef";
process.env.CLIENT_URL = "http://localhost:5173";
process.env.CRON_SECRET = "careflow-test-cron-secret";
process.env.EMAIL_USER = "tests@careflow.example";
process.env.EMAIL_PASS = "test-only-password";
process.env.EMAIL_HOST = "smtp.example.test";

const nodemailer = require("nodemailer");
const { MongoMemoryServer } = require("mongodb-memory-server");
const mongoose = require("mongoose");
const supertest = require("supertest");

const sentEmails = [];

// The mailer builds its transporter lazily on the first send, so replacing the factory
// here means no test ever talks to a real SMTP server while the code path stays intact.
nodemailer.createTransport = () => ({
  sendMail: async (mail) => {
    sentEmails.push(mail);
    return { accepted: [mail.to] };
  },
});

let mongod = null;
let request = null;

async function startTestServer() {
  if (request) return request;

  mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri("careflow_test");

  const app = require("../../src/app");
  await mongoose.connect(process.env.MONGO_URI);

  // Build every declared index up front: the partial unique indexes on appointments are
  // part of the behaviour under test, and Mongoose builds them in the background.
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));

  request = supertest(app);
  return request;
}

async function stopTestServer() {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
  mongod = null;
  request = null;
}

/** Removes every document but keeps the schema and indexes. */
async function resetDatabase() {
  const collections = await mongoose.connection.db.collections();
  await Promise.all(collections.map((collection) => collection.deleteMany({})));
  sentEmails.length = 0;
}

module.exports = { startTestServer, stopTestServer, resetDatabase, sentEmails };
