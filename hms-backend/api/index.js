require("dotenv").config();
const app = require("../src/app");

// Vercel serverless functions expect a request handler export.
// Express apps work directly as that handler.
module.exports = app;
