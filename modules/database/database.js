const { logger } = require('../../services/logger/logger');
const pgp = require('pg-promise')({
    connect: (e) => {
        logger.info(`Connected to database: ${e.client.database}`);
    },
    disconnect: (e) => {
        logger.info(`Disconnecting from database: ${e.client.database}`);
    },
    error: (err, e) => {
        logger.error(`Database error: ${err.message}`, {
            query: e.query,
            params: e.params,
            stack: err.stack
        });
    },
});

require("dotenv").config();

const dbConfig = {
    host: process.env.DATABASE_HOST,
    port: process.env.DATABASE_PORT,
    database: process.env.DATABASE,
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    ssl: { rejectUnauthorized: false },
    max: 20, // maximum pool size
    idleTimeoutMillis: 30000, // close idle clients after 30s
    connectionTimeoutMillis: 5000, // timeout connecting
    allowExitOnIdle: true,
    application_name: 'cryptify_app_server',
    noWarnings: true,
    poolSize: 20,
    poolIdleTimeout: 10000
};

// Validate required environment variables
const requiredEnvVars = ['DATABASE_HOST', 'DATABASE_PORT', 'DATABASE', 'DATABASE_USER', 'DATABASE_PASSWORD'];
for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
        throw new Error(`Missing required environment variable: ${envVar}`);
    }
}

const db = pgp(dbConfig);

// Graceful shutdown
process.on('SIGINT', async () => {
    logger.info('Shutting down...');
    try {
        await pgp.end();
        logger.info('Database connections closed');
        process.exit(0);
    } catch (error) {
        logger.error('Error during shutdown:', error);
        process.exit(1);
    }
});

module.exports = db;