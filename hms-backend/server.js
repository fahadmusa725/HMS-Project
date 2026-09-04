require("dotenv").config();
const app = require("./src/app");

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`[Server] HMS backend running on http://localhost:${PORT}`);
});
