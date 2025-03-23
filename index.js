const express = require("express");
const bodyParser = require("body-parser");
const fs = require("fs");
const https = require("https");
const http = require("http");
const path = require("path");
const helmet = require("helmet");
require("dotenv").config();

const { logger, Middlewarelogs } = require("./services/logger/logger.js");
const routes = require("./routes/routes.js");

const app = express();
const PORT = process.env.SERVER_PORT || 3450;
const HTTP_PORT = 80; // Redirect HTTP requests

// Middlewares
app.use(Middlewarelogs);
app.use(helmet());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// Error handling middleware
app.use((err, req, res, next) => {
    logger.error(`Error occurred: ${err.message}`);
    res.status(500).send("Something went wrong!");
});

// Define Routes
app.use("/", routes);

// SSL Certificates
const options = {
    key: fs.readFileSync("/etc/letsencrypt/live/cryptify.duckdns.org/privkey.pem"),
    cert: fs.readFileSync("/etc/letsencrypt/live/cryptify.duckdns.org/fullchain.pem"),
};

// 🔹 Redirect HTTP to HTTPS
http.createServer((req, res) => {
    res.writeHead(301, { Location: `https://${req.headers.host}${req.url}` });
    res.end();
}).listen(HTTP_PORT, () => {
    logger.info(`HTTP Server running on PORT ${HTTP_PORT}, redirecting to HTTPS`);
});

// 🔹 Start HTTPS Server
https.createServer(options, app).listen(PORT, '0.0.0.0', () => {
    logger.info(`✅ Server started and running securely on https://cryptify.duckdns.org at ${new Date()}`);
});

// Handle SIGTERM for clean shutdown
process.on("SIGTERM", () => {
    logger.info("SIGTERM signal received: closing HTTP & HTTPS servers");
    app.close(() => {
        logger.info("🔴 Server closed");
    });
});
