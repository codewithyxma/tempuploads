const db = require("../../modules/database/database");
const { logger } = require("../logger/logger");

const COIN_MAPPINGS = {
    'tbtc4': 'TBTC4',
    'tsol': 'TSOL',
    'tada': 'TADA',
    'tdoge': 'TDOGE'
};

const VALUE_DIVISORS = {
    'TBTC4': 100000000,
    'TSOL': 1000000000,
    'TADA': 1000000,
    'TDOGE': 100000000
};

const DEPOSIT_STATES = {
    'pending': 'pending',
    'confirmed': 'completed',
    'failed': 'failed',
    'unconfirmed': 'pending'
};

async function handleDeposit(webhookData) {
    const { hash, coin, state, receiver, valueString } = webhookData;
    logger.info(`Processing deposit: Hash=${hash}, Coin=${coin}, State=${state}`);

    try {
        return await db.tx(async (t) => {
            const dbCoinSymbol = COIN_MAPPINGS[coin];

            if (!dbCoinSymbol) {
                logger.warn(`Unknown coin received: ${coin}`);
                return false;
            }

            // 1. Fetch user and validate currency in **one query**
            const userAddress = await t.oneOrNone(
                `SELECT ua.user_id, ua.crypto 
                FROM user_addresses ua
                JOIN currencies c ON ua.crypto = c.symbol
                WHERE ua.address = $1 AND c.symbol = $2 LIMIT 1`,
                [receiver, dbCoinSymbol]
            );

            if (!userAddress) {
                logger.warn(`No user found for address: ${receiver}`);
                return false;
            }

            // 2. Check if deposit already exists
            const existingDeposit = await t.oneOrNone(
                `SELECT 1 FROM deposits WHERE blockchain_tx_hash = $1 LIMIT 1`,
                [hash]
            );

            if (existingDeposit) {
                logger.info(`Deposit already processed: ${hash}`);
                return false;
            }

            // 3. Store webhook data
            const { bitgo_wallet_id } = await t.one(
                `INSERT INTO bitgo_wallet (event_type, payload)
                VALUES ('crypto_deposit', $1)
                RETURNING bitgo_wallet_id`,
                [webhookData]
            );

            // 4. Convert amount safely
            const amount = parseFloat(valueString) / VALUE_DIVISORS[dbCoinSymbol];

            if (isNaN(amount) || amount <= 0) {
                logger.error(`Invalid amount: ${valueString} for ${dbCoinSymbol}`);
                return false;
            }

            // 5. Insert deposit record
            const depositStatus = DEPOSIT_STATES[state] || 'pending';

            await t.none(
                `INSERT INTO deposits (user_id, bitgo_uid, crypto, amount, blockchain_tx_hash, status)
                VALUES ($1, $2, $3, $4, $5, $6)`,
                [userAddress.user_id, bitgo_wallet_id, dbCoinSymbol, amount, hash, depositStatus]
            );

            // 6. Update balance only if deposit is confirmed
            if (depositStatus === 'completed') {
                await t.none(
                    `INSERT INTO user_balances (user_id, crypto, balance)
                    VALUES ($1, $2, $3)
                    ON CONFLICT (user_id, crypto) 
                    DO UPDATE SET balance = user_balances.balance + EXCLUDED.balance,
                                  updated_at = NOW()`,
                    [userAddress.user_id, dbCoinSymbol, amount]
                );
            }

            logger.info(`Deposit completed: ${amount} ${dbCoinSymbol}`);
            return true;
        });

    } catch (error) {
        logger.error(`Deposit Processing Failed: ${error.message}`);
        return false;
    }
}

module.exports = { handleDeposit };
