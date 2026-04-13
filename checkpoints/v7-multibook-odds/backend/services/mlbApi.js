const axios = require("axios");

// Configured axios instance pointed at the MLB Stats API.
// The MLB Stats API is free and requires no auth key — CORS is the only blocker,
// which is why this proxy exists.
const mlb = axios.create({
  baseURL: "https://statsapi.mlb.com/api/v1",
  timeout: 12000,
  headers: {
    "User-Agent": "PropScout/1.0",
    "Accept": "application/json",
  },
});

// Log outbound requests in dev
mlb.interceptors.request.use((config) => {
  if (process.env.NODE_ENV !== "production") {
    console.log(`  → MLB API  ${config.method?.toUpperCase()} ${config.baseURL}${config.url}`);
  }
  return config;
});

// Surface API error detail without exposing internals
mlb.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err.response?.status ?? "TIMEOUT";
    const msg    = err.response?.data?.message ?? err.message;
    console.error(`  ✗ MLB API ${status}: ${msg}`);
    return Promise.reject(err);
  }
);

module.exports = mlb;
