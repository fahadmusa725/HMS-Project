/**
 * Startup environment validation.
 *
 * Without this, a missing JWT_SECRET or CLIENT_URL only shows up as confusing
 * runtime failures (every login 401s, CORS silently blocks the frontend). On
 * Vercel a throw here fails the invocation immediately and loudly instead.
 */
const REQUIRED_VARS = ["MONGO_URI", "JWT_SECRET", "CLIENT_URL"];
const MIN_JWT_SECRET_LENGTH = 32;

function validateEnv() {
  const problems = [];

  REQUIRED_VARS.forEach((name) => {
    if (!process.env[name] || !process.env[name].trim()) {
      problems.push(`${name} is not set.`);
    }
  });

  if (process.env.JWT_SECRET && process.env.JWT_SECRET.trim().length < MIN_JWT_SECRET_LENGTH) {
    problems.push(`JWT_SECRET must be at least ${MIN_JWT_SECRET_LENGTH} characters.`);
  }

  if (problems.length > 0) {
    throw new Error(`Invalid environment configuration:\n- ${problems.join("\n- ")}`);
  }
}

module.exports = validateEnv;
