const axios = require("axios");
const db = require("../../modules/database/database");
const { logger } = require("../logger/logger");
const { config } = require("dotenv");

config();

const wallets = [
    { coin: process.env.BTC_COIN, walletId: process.env.BTC_WALLET_ID },
    { coin: process.env.ADA_COIN, walletId: process.env.ADA_WALLET_ID },
    { coin: process.env.SOL_COIN, walletId: process.env.SOL_WALLET_ID },
    { coin: process.env.DOGE_COIN, walletId: process.env.DOGE_WALLET_ID }
];

const accessToken = process.env.BITGO_ACCESS_TOKEN;
if (!accessToken) {
    logger.error("BitGo access token is missing. Address generation will be skipped.");
}

/**
 * Generate and store cryptocurrency addresses for a user asynchronously.
 * Runs in the background using `Promise.allSettled()` for parallel execution.
 *
 * @param {string} userId - The ID of the newly registered user.
 */
async function generateUserAddresses(userId) {
    if (!accessToken) return;

    try {
        const tasks = wallets
            .filter(({ walletId }) => walletId)
            .map(({ coin, walletId }) =>
                axios.post(
                    `https://app.bitgo-test.com/api/v2/${coin}/wallet/${walletId}/address`,
                    {},
                    { headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` } }
                )
                .then((response) => ({ coin, address: response.data.address }))
                .catch((error) => {
                    logger.error(`Failed to create ${coin.toUpperCase()} address for User ${userId}: ${
                        error.response ? JSON.stringify(error.response.data) : error.message
                    }`);
                    return null; // Prevents rejection from stopping the whole process
                })
            );

        const results = await Promise.allSettled(tasks);

        // Filter out failed address generations
        const successfulAddresses = results
            .filter(({ status, value }) => status === "fulfilled" && value?.address)
            .map(({ value }) => value);

        if (!successfulAddresses.length) return;

        // Store addresses in DB within a single transaction
        await db.tx(async (t) => {
            for (const { coin, address } of successfulAddresses) {
                logger.info(`New ${coin.toUpperCase()} address for User ${userId}: ${address}`);

                await t.none(
                    `INSERT INTO user_addresses (user_id, crypto, address) 
                     VALUES ($1, $2, $3) 
                     ON CONFLICT (user_id, crypto) DO NOTHING`,
                    [userId, coin.toUpperCase(), address]
                );

                await t.none(
                    `INSERT INTO bitgo_wallet (event_type, payload) 
                     VALUES ('address_generation', $1)`,
                    [JSON.stringify({ userId, coin, address })]
                );
            }
        });

    } catch (error) {
        logger.error(`Unexpected error in address generation for User ${userId}: ${error.message}`);
    }
}

module.exports = generateUserAddresses;
