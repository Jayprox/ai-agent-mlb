const jwt = require("jsonwebtoken");

function requireAuth(req, res, next) {
  const header = req.get("Authorization") || "";
  const [scheme, token] = header.split(" ");

  if (scheme !== "Bearer" || !token || !process.env.JWT_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = payload.userId;
    req.username = payload.username;
    return next();
  } catch (_err) {
    return res.status(401).json({ error: "Unauthorized" });
  }
}

module.exports = requireAuth;
