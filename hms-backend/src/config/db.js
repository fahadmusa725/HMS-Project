const mongoose = require("mongoose");

/**
 * Serverless-safe MongoDB connection.
 * Vercel spins functions up/down constantly - without caching, every
 * invocation would open a brand new connection and quickly exhaust
 * MongoDB Atlas's connection limit. We cache the connection promise
 * on the global object so warm invocations reuse it.
 */
let cached = global._mongooseConnection;

if (!cached) {
  cached = global._mongooseConnection = { conn: null, promise: null };
}

async function connectDB() {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const uri = process.env.MONGO_URI;
    if (!uri) {
      throw new Error("MONGO_URI is not set in environment variables.");
    }

    cached.promise = mongoose
      .connect(uri, {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 10000,
      })
      .then((mongooseInstance) => {
        console.log("[DB] MongoDB connected");
        return mongooseInstance;
      });
  }

  cached.conn = await cached.promise;
  return cached.conn;
}

module.exports = connectDB;
