const express = require("express");
const fs = require("fs");
const http = require("http");
const https = require("https");
const helmet = require("helmet");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

const { logger, Middlewarelogs } = require("./services/logger/logger.js");
const routes = require("./routes/routes.js");
const webhookRoutes = require("./routes/webhook");

const app = express();
const HTTPS_PORT = process.env.SERVER_PORT || 3450;
const HTTP_PORT = 80; // For HTTP -> HTTPS redirect

// 🔹 Middlewares
app.use(Middlewarelogs);
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// 🔹 Basic Route
app.get("/", (req, res) => {
  res.status(200)
    .set("Content-Type", "text/html")
    .sendFile(path.join(__dirname, "/public/index.html"));
});

// 🔹 API Routes
app.use("/api", routes);
app.use("/webhook", webhookRoutes);

// 🔹 Error Handler
app.use((err, req, res, next) => {
  logger.error(`❌ Error: ${err.message}`);
  res.status(500).json({ error: "Something went wrong" });
});

// 🔹 SSL Options
const options = {
  key: fs.readFileSync("/etc/letsencrypt/live/cryptify.duckdns.org/privkey.pem"),
  cert: fs.readFileSync("/etc/letsencrypt/live/cryptify.duckdns.org/fullchain.pem"),
};

// 🔹 HTTP Redirect to HTTPS
const httpServer = http.createServer((req, res) => {
  res.writeHead(301, { Location: `https://${req.headers.host}${req.url}` });
  res.end();
});

// 🔹 Start HTTP Redirect Server
httpServer.listen(HTTP_PORT, () => {
  logger.info(`🌐 HTTP server running on port ${HTTP_PORT} (redirecting to HTTPS)`);
});

// 🔹 Start HTTPS Server
const httpsServer = https.createServer(options, app);
httpsServer.listen(HTTPS_PORT, "0.0.0.0", () => {
  logger.info(`✅ HTTPS server running at https://cryptify.duckdns.org on port ${HTTPS_PORT}`);
});

// 🔹 Graceful Shutdown
process.on("SIGTERM", () => {
  logger.info("SIGTERM signal received: shutting down servers...");
  httpsServer.close(() => {
    logger.info("✅ HTTPS server closed gracefully.");
  });
  httpServer.close(() => {
    logger.info("✅ HTTP server closed gracefully.");
  });
});
