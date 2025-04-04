const express = require('express');
const router = express.Router();
const { handleDeposit } = require('../services/bitgo/webhookHandler');
const { logger } = require('../services/logger/logger');

router.post('/bitgo', async (req, res) => {
    const webhookData = req.body;

    // Validate Webhook Structure
    if (!webhookData || webhookData.type !== 'transfer') {
        logger.warn('Invalid webhook received:', JSON.stringify(webhookData, null, 2));
        return res.status(400).json({ success: false, error: 'Invalid webhook type' });
    }

    const { hash, coin, state, receiver, valueString } = webhookData;
    if (!hash || !coin || !state || !receiver || !valueString) {
        logger.warn('Webhook missing required fields:', JSON.stringify(webhookData, null, 2));
        return res.status(400).json({ success: false, error: 'Incomplete webhook data' });
    }

    logger.info(`🔔 Webhook Received: Hash=${hash}, Coin=${coin}, State=${state}`);

    // Process webhook asynchronously
    process.nextTick(async () => {
        try {
            await handleDeposit(webhookData);
            logger.info(`✅ Deposit processed successfully: ${hash}`);
        } catch (error) {
            logger.error(`❌ Deposit processing failed: ${error.message}`);
        }
    });

    // Send immediate response to BitGo to avoid timeouts
    return res.status(200).json({ success: true, message: 'Webhook received' });
});

module.exports = router;
