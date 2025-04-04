const winston = require("winston");

// Logger configuration
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message }) => {
            return `${timestamp} ${level}: ${message}`;
        })
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ 
            filename: 'Server.log',
            maxFiles: 5,
            tailable: true
        })
    ]
});

function Middlewarelogs(req, res, next) {
    logger.http(`Request: ${req.method} ${req.url} from IP: ${req.ip}`);

    res.on("finish", () => {
        if (res.statusCode >= 400 && res.statusCode <= 500) {
            logger.warn(`Response: ${res.statusCode} for ${req.method} ${req.url} from IP: ${req.ip}`);
        } else if (res.statusCode > 500) {
            logger.error(`Response: ${res.statusCode} for ${req.method} ${req.url} from IP: ${req.ip}`);
        } else {
            logger.info(`Response: ${res.statusCode} for ${req.method} ${req.url} from IP: ${req.ip}`);
        }
    });
    next();
}

// Export both logger and middleware
module.exports = { logger, Middlewarelogs };