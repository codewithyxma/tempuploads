const express = require("express");
const helmet = require("helmet");
const path = require("path");
const cors = require("cors");
const { logger, Middlewarelogs } = require("./services/logger/logger.js");
const routes = require("./routes/routes.js");
const webhookRoutes = require("./routes/webhook");

require("dotenv").config();

const app = express();
const PORT = process.env.SERVER_PORT || 3450;

app.use(Middlewarelogs);
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.status(200)
    .set("Content-Type", "text/html")
    .sendFile(path.join(__dirname, "/public/index.html"));
});

app.use("/api", routes);
app.use("/webhook", webhookRoutes);

app.use((err, req, res, next) => {
  logger.error(`❌ Error: ${err.message}`);
  res.status(500).json({ error: "Something went wrong" });
});

const server = app.listen(PORT, "0.0.0.0", () => {
  logger.info(`✅ Server running on: http://localhost:${PORT} at ${new Date()}`);
});

process.on("SIGTERM", () => {
  logger.info("SIGTERM received, shutting down server...");
  server.close(() => {
    logger.info("Server closed gracefully.");
  });
});
