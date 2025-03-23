const express = require('express');
const router = express.Router();
const db = require("../modules/database/database");
const { logger } = require('../services/logger/logger');
const BcryptUtil = require('../utils/bcrypt');
const JWTUtil = require('../utils/jwt');
const GoogleUtil = require('../utils/google');
const path = require('path');

// Just for Testing purpose in development time
router.get("/api/test", async (req, res) => {
    try {
        const result = await db.query('SELECT NOW()'); // checking Database
        res.status(200).json({ currentTime: result });
    } catch (error) {
        logger.error(`Error getting current time: ${error.message}`);
        res.status(500).json({ error: "Failed to get current time from DB" });
    }
})

// Health check endpoint
router.get("/", (req, res) => {
    return res.status(200)
              .set('Content-Type', 'text/html')
              .sendFile(path.join(__dirname, '../public/index.html'));
});

// Register a new user
router.post("/api/register", async (req, res, next) => {
    const { email, phone, fname, lname, dob, password, trx_pin, dateOfBirth } = req.body;

    // Validate required fields
    if (!email || !phone || !fname || !lname || !password || !trx_pin) {
        return res.status(400).json({
            status: 400,
            message: 'All fields (email, phone, fname, lname, password, trx_pin) are required'
        });
    }

    try {
        // Validate date format
        const parsedDate = new Date(dateOfBirth);
        if (isNaN(parsedDate.getTime())) {
            return res.status(400).json({
                status: 400,
                message: 'Invalid date format. Use YYYY-MM-DD'
            });
        }

        // Validate age (optional)
        const today = new Date();
        const minDate = new Date('1900-01-01');
        if (parsedDate > today || parsedDate < minDate) {
            return res.status(400).json({
                status: 400,
                message: 'Invalid date of birth'
            });
        }

        // Format date for PostgreSQL
        const formattedDate = parsedDate.toISOString().split('T')[0];

        return db.tx(async (t) => {
            try {
                // Check for existing user
                const existingUser = await t.oneOrNone(
                    `SELECT email, phone_number 
                     FROM users 
                     WHERE email = $1 OR phone_number = $2`,
                    [email, phone]
                );

                if (existingUser) {
                    const field = existingUser.email === email ? 'email' : 'phone number';
                    return res.status(409).json({
                        status: 409,
                        message: `User with this ${field} already exists`
                    });
                }

                // Hash password and transaction PIN
                let passwordHash, pinHash;
                try {
                    passwordHash = await BcryptUtil.hash(password);
                    pinHash = await BcryptUtil.hash(trx_pin);
                } catch (hashError) {
                    logger.error('Error hashing credentials:', hashError);
                    return res.status(500).json({
                        status: 500,
                        message: 'Error processing credentials'
                    });
                }

                let newUser;
                try {
                    newUser = await t.one(
                        `INSERT INTO users (
                            first_name,
                            last_name,
                            email,
                            phone_number,
                            password_hash,
                            date_of_birth,  
                            transaction_pin
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
                        RETURNING id, email`,
                        [fname, lname, email, phone, passwordHash, formattedDate, pinHash]
                    );
                } catch (dbError) {
                    logger.error('Database error during user creation:', dbError);
                    return res.status(500).json({
                        status: 500,
                        message: 'Error creating user account'
                    });
                }

                // Generate JWT token
                let token;
                try {
                    token = JWTUtil.generateToken({
                        userId: newUser.id,
                        email: newUser.email
                    });
                } catch (tokenError) {
                    logger.error('Error generating token:', tokenError);
                    return res.status(500).json({
                        status: 500,
                        message: 'Error generating access token'
                    });
                }

                logger.info(`New User created successfully: ${newUser.id}`);

                return res.status(201).json({
                    success: true,
                    userId: newUser.id,
                    token: token
                });
            } catch (error) {
                logger.error('Unexpected error in registration process:', error);
                return res.status(500).json({
                    status: 500,
                    message: 'An unexpected error occurred'
                });
            }
        });
    } catch (error) {
        logger.error('Transaction error:', error);
        return res.status(500).json({
            status: 500,
            message: 'Database transaction failed'
        });
    }
});

// Update the login endpoint
router.post("/api/login", async (req, res) => {
    const { email, password } = req.body;

    // Validate required fields
    if (!email || !password) {
        return res.status(400).json({
            status: 400,
            message: 'Email and password are required'
        });
    }

    try {   
        // Find user with additional details
        const user = await db.oneOrNone(
            `SELECT id, email, password_hash, first_name, last_name, phone_number 
             FROM users 
             WHERE email = $1`,
            [email]
        );

        if (!user) {
            return res.status(401).json({
                status: 401,
                message: 'Invalid email or password'
            });
        }

        // Verify password
        try {
            const isValidPassword = await BcryptUtil.compare(password, user.password_hash);
            if (!isValidPassword) {
                return res.status(401).json({
                    status: 401,
                    message: 'Invalid email or password'
                });
            }
        } catch (hashError) {
            logger.error('Error verifying password:', hashError);
            return res.status(500).json({
                status: 500,
                message: 'Error processing credentials'
            });
        } 

        // Generate JWT token
        let token;
        try {
            token = JWTUtil.generateToken({
                userId: user.id,
                email: user.email
            });
        } catch (tokenError) {
            logger.error('Error generating token:', tokenError);
            return res.status(500).json({
                status: 500,
                message: 'Error generating access token'
            });
        }

        logger.info(`User logged in successfully: ${user.id}`);

        // Update the login endpoint response
        return res.status(200).json({
            success: true,
            userId: user.id,  
            token: token,
            userData: {
                id: user.id, 
                firstName: user.first_name,
                lastName: user.last_name,
                email: user.email,
                phoneNumber: user.phone_number
            }
        });

    } catch (error) {
        logger.error('Login error:', error);
        return res.status(500).json({
            status: 500,
            message: 'An unexpected error occurred'
        });
    }
});

// Also update the Google login endpoint similarly
router.post("/api/google-login", async (req, res) => {
    const { idToken } = req.body;
    logger.info(`Google login request received`);

    if (!idToken) {
        return res.status(400).json({
            status: 400,
            message: 'Google ID token is required'
        });
    }

    try {
        // Verify Google token
        const googleUser = await GoogleUtil.verifyToken(idToken);

        if (!googleUser.email_verified) {
            return res.status(401).json({
                status: 401,
                message: 'Email not verified with Google'
            });
        }

        // Check if user exists
        const user = await db.oneOrNone(
            `SELECT id, email, first_name, last_name, phone_number 
             FROM users WHERE email = $1`,
            [googleUser.email]
        );

        if (!user) {
            return res.status(404).json({
                status: 404,
                message: 'Please sign up first',
                isNewUser: true
            });
        }

        // Generate JWT token
        const token = JWTUtil.generateToken({
            userId: user.id,
            email: user.email,
            google_id: googleUser.google_id
        });

        logger.info(`Google login successful for user: ${googleUser.email}`);

        return res.status(200).json({
            success: true,
            userId: user.id,
            token: token,
            userData: {
                id: user.id,
                firstName: user.first_name,
                lastName: user.last_name,
                email: user.email,
                phoneNumber: user.phone_number
            }
        });

    } catch (error) {
        logger.error('Google login error:', error);
        return res.status(500).json({
            status: 500,
            message: 'Authentication failed'
        });
    }
});

router.post('/api/check-user', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({
      status: 400,
      message: 'Email is required',
    });
  }

  try {
    const user = await db.oneOrNone(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (user) {
        logger.info(`User exists: ${email}`);
      return res.status(200).json({ exists: true });
    } else {
      return res.status(200).json({ exists: false });
    }
  } catch (error) {
    logger.error('Error checking user existence:', error);
    return res.status(500).json({
      status: 500,
      message: 'An unexpected error occurred',
    });
  }
});

// Add balance endpoint after existing routes
router.get("/api/get-balance/:userId", async (req, res) => {
    const { userId } = req.params;

    if (!userId) {
        return res.status(400).json({
            success: false,
            message: 'User ID is required'
        });
    }

    try {
        // Get balances from user_balances table
        const balances = await db.manyOrNone(
            `SELECT crypto, balance 
             FROM user_balances 
             WHERE user_id = $1`,
            [userId]
        );

        // Transform to required format
        const formattedBalances = {
            BTC: "0",
            ETH: "0",
            XRP: "0",
            SOL: "0"
        };

        balances?.forEach(balance => {
            formattedBalances[balance.crypto] = balance.balance.toString();
        });

        logger.info(`Fetched balances for user: ${userId}`);
        return res.status(200).json({
            success: true,
            balances: formattedBalances
        });

    } catch (error) {
        logger.error('Error fetching balances:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch balances'
        });
    }
});

/**
 * Get all transactions for a user with analytics
 * @route GET /api/transactions/:userId
 */
router.get('/api/transactions/:userId', async (req, res) => {
    const { userId } = req.params;

    if (!userId) {
        return res.status(400).json({
            success: false,
            message: 'User ID is required'
        });
    }

    try {
        // First verify if user exists
        const userExists = await db.oneOrNone(
            'SELECT id FROM users WHERE id = $1',
            [userId]
        );

        if (!userExists) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Get transactions with user details
        const transactions = await db.any(`
            SELECT 
                t.transaction_id,
                t.sender_id,
                t.receiver_id,
                t.crypto,
                t.amount,
                t.status,
                t.created_at,
                s.first_name as sender_first_name,
                s.last_name as sender_last_name,
                r.first_name as receiver_first_name,
                r.last_name as receiver_last_name,
                c.name as crypto_name
            FROM transactions t
            LEFT JOIN users s ON t.sender_id = s.id
            LEFT JOIN users r ON t.receiver_id = r.id
            LEFT JOIN currencies c ON t.crypto = c.symbol
            WHERE t.sender_id = $1 
                OR t.receiver_id = $1
            ORDER BY t.created_at DESC`,
            [userId]
        );

        if (!transactions.length) {
            return res.status(200).json({
                success: true,
                transactions: [],
                analytics: {
                    totalTransactions: 0,
                    sentTransactions: 0,
                    receivedTransactions: 0,
                    topSender: { message: "No incoming transactions" },
                    topReceiver: { message: "No outgoing transactions" }
                }
            });
        }

        // Analyze transactions
        const analytics = transactions.reduce((acc, tx) => {
            const isReceived = tx.receiver_id === userId;
            const partnerId = isReceived ? tx.sender_id : tx.receiver_id;
            const partnerName = isReceived 
                ? `${tx.sender_first_name} ${tx.sender_last_name}`
                : `${tx.receiver_first_name} ${tx.receiver_last_name}`;
            
            // Initialize partner data if not exists
            if (!acc.partners[partnerId]) {
                acc.partners[partnerId] = {
                    id: partnerId,
                    name: partnerName,
                    sent: { total: 0, by_crypto: {} },
                    received: { total: 0, by_crypto: {} }
                };
            }

            const amount = parseFloat(tx.amount);
            const partner = acc.partners[partnerId];

            if (isReceived) {
                partner.received.total += amount;
                partner.received.by_crypto[tx.crypto] = 
                    (partner.received.by_crypto[tx.crypto] || 0) + amount;
                
                if (amount > acc.topSender.amount) {
                    acc.topSender = {
                        id: partnerId,
                        name: partnerName,
                        amount: amount,
                        crypto: tx.crypto
                    };
                }
            } else {
                partner.sent.total += amount;
                partner.sent.by_crypto[tx.crypto] = 
                    (partner.sent.by_crypto[tx.crypto] || 0) + amount;
                
                if (amount > acc.topReceiver.amount) {
                    acc.topReceiver = {
                        id: partnerId,
                        name: partnerName,
                        amount: amount,
                        crypto: tx.crypto
                    };
                }
            }

            return acc;
        }, {
            partners: {},
            topSender: { amount: 0 },
            topReceiver: { amount: 0 }
        });

        // Count transactions
        const sentTransactions = transactions.filter(tx => tx.sender_id === userId);
        const receivedTransactions = transactions.filter(tx => tx.receiver_id === userId);

        logger.info(`Retrieved ${transactions.length} transactions for user: ${userId}`);

        return res.status(200).json({
            success: true,
            data: {
                transactions: transactions.map(tx => ({
                    ...tx,
                    is_sender: tx.sender_id === userId
                })),
                analytics: {
                    totalTransactions: transactions.length,
                    sentTransactions: sentTransactions.length,
                    receivedTransactions: receivedTransactions.length,
                    topSender: analytics.topSender.amount > 0 ? analytics.topSender : null,
                    topReceiver: analytics.topReceiver.amount > 0 ? analytics.topReceiver : null,
                    transactionPartners: Object.values(analytics.partners)
                }
            }
        });

    } catch (error) {
        logger.error('Error fetching transactions:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch transactions'
        });
    }
});

module.exports = router;