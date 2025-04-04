const db = require("../database/database");
const { logger } = require('../../services/logger/logger');
const BcryptUtil = require('../../utils/bcrypt');
const JWTUtil = require('../../utils/jwt');
const GoogleUtil = require('../../utils/google');
const generateUserAddresses = require('../../services/bitgo/bitgoService');

const UserRegister = async (req, res) => {
    try {
        const { email, phone, fname, lname, dob, password, trx_pin } = req.body;
        
        // Validate required fields
        if (!email || !phone || !fname || !lname || !dob || !password || !trx_pin) {
            return res.status(400).json({ 
                status: 400, 
                message: "All fields are required" 
            });
        }

        // Parse and validate the date
        const parsedDate = new Date(dob);
        if (isNaN(parsedDate.getTime())) {
            return res.status(400).json({ 
                status: 400, 
                message: "Invalid date format. Expected YYYY-MM-DD" 
            });
        }

        // Validate date range
        const currentDate = new Date();
        const minDate = new Date('1900-01-01');
        
        if (parsedDate > currentDate || parsedDate < minDate) {
            return res.status(400).json({ 
                status: 400, 
                message: "Date of birth must be between 1900-01-01 and current date" 
            });
        }

        // Format date to YYYY-MM-DD for database
        const formattedDate = parsedDate.toISOString().split('T')[0];

        // Rest of your registration code...
        const newUser = await db.tx(async (t) => {
            const existingUser = await t.oneOrNone(
                "SELECT email, phone_number FROM users WHERE email = $1 OR phone_number = $2",
                [email, phone]
            );

            if (existingUser) {
                return res.status(409).json({
                    status: 409,
                    message: `User with this ${existingUser.email === email ? "email" : "phone number"} already exists`
                });
            }

            const [passwordHash, pinHash] = await Promise.all([
                BcryptUtil.hash(password),
                BcryptUtil.hash(trx_pin)
            ]);

            return t.one(
                `INSERT INTO users (first_name, last_name, email, phone_number, password_hash, date_of_birth, transaction_pin)
                 VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, email`,
                [fname, lname, email, phone, passwordHash, formattedDate, pinHash]
            );
        });

        const token = JWTUtil.generateToken({ userId: newUser.id, email: newUser.email });
        logger.info(`New user created: ${newUser.id}`);

        // Background process for crypto address generation
        generateUserAddresses(newUser.id);

        return res.status(201).json({ success: true, userId: newUser.id, token });
    } catch (error) {
        logger.error("Registration error:", error);
        return res.status(500).json({ 
            status: 500, 
            message: "An unexpected error occurred",
            error: error.message 
        });
    }
}

const UserLogin = async (req, res) => {
    const { email, password } = req.body;

    // Validate required fields
    if (!email || !password) {
        return res.status(400).json({ success: false, message: "Email and password are required" });
    }

    try {
        // Fetch user data including password hash
        const user = await db.oneOrNone(
            `SELECT id, email, password_hash, first_name, last_name, phone_number 
             FROM users 
             WHERE email = $1`, [email]
        );

        if (!user) {
            logger.warn(`Failed login attempt for email: ${email}`);
            return res.status(401).json({ success: false, message: "Invalid email or password" });
        }

        // Verify password
        if (!(await BcryptUtil.compare(password, user.password_hash))) {
            logger.warn(`Invalid password attempt for user ID: ${user.id}`);
            return res.status(401).json({ success: false, message: "Invalid email or password" });
        }

        // Generate JWT token
        const token = JWTUtil.generateToken({ userId: user.id, email: user.email });

        logger.info(`User logged in successfully: ${user.id}`);

        // Return user data and token
        return res.status(200).json({
            success: true,
            token,
            user: {
                id: user.id,
                firstName: user.first_name,
                lastName: user.last_name,
                email: user.email,
                phoneNumber: user.phone_number
            }
        });

    } catch (error) {
        logger.error(`Login error for email: ${email}`, error);
        return res.status(500).json({ success: false, message: "An unexpected error occurred" });
    }
};

const UserGoogleLogin = async (req, res) => {
    const { idToken } = req.body;
    logger.info("Google login request received");

    // Validate input
    if (!idToken) {
        return res.status(400).json({ success: false, message: "Google ID token is required" });
    }

    try {
        // Verify Google token
        const googleUser = await GoogleUtil.verifyToken(idToken);

        if (!googleUser?.email_verified) {
            logger.warn(`Google login failed: Email not verified (${googleUser?.email || "Unknown"})`);
            return res.status(401).json({ success: false, message: "Email not verified with Google" });
        }

        // Check if user exists in DB
        const user = await db.oneOrNone(
            `SELECT id, email, first_name, last_name, phone_number 
             FROM users WHERE email = $1`, [googleUser.email]
        );

        if (!user) {
            logger.warn(`Google login attempt for unregistered email: ${googleUser.email}`);
            return res.status(404).json({
                success: false,
                message: "Please sign up first",
                isNewUser: true
            });
        }

        // Generate JWT token
        const token = JWTUtil.generateToken({
            userId: user.id,
            email: user.email
        });

        logger.info(`Google login successful for user ID: ${user.id}`);

        return res.status(200).json({
            success: true,
            token,
            user: {
                id: user.id,
                firstName: user.first_name,
                lastName: user.last_name,
                email: user.email,
                phoneNumber: user.phone_number
            }
        });

    } catch (error) {
        logger.error("Google login error:", error);
        return res.status(500).json({ success: false, message: "Authentication failed" });
    }
};

const CheckUser = async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ success: false, message: "Email is required" });
    }

    try {
        const user = await db.oneOrNone("SELECT id FROM users WHERE email = $1", [email]);

        logger.info(`User check completed: ${user ? "Exists" : "Does not exist"}`);
        return res.status(200).json({ success: true, exists: !!user });

    } catch (error) {
        logger.error("Database error in CheckUser:", error);
        return res.status(500).json({ success: false, message: "An unexpected error occurred" });
    }
};

const UserGetBalance = async (req, res) => {
    const { userId } = req.params;

    if (!userId) {
        return res.status(400).json({
            success: false,
            message: 'User ID is required'
        });
    }

    try {
        // Fetch balances from user_balances
        const balances = await db.manyOrNone(
            `SELECT crypto, balance::TEXT AS balance 
             FROM user_balances 
             WHERE user_id = $1`,
            [userId]
        );

        // Convert array to object format
        const formattedBalances = balances.reduce((acc, { crypto, balance }) => {
            acc[crypto] = balance;
            return acc;
        }, {});

        logger.info(`Fetched balances for user: ${userId}`);
        return res.status(200).json({
            success: true,
            balances: formattedBalances
        });

    } catch (error) {
        logger.error(`Error fetching balances for user ${userId}: ${error.message}`);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch balances'
        });
    }
};

const UserGetDepositAddresses = async (req, res) => {
    const { userId } = req.params;

    try {
        const addresses = await db.any(
            `SELECT crypto, address 
             FROM user_addresses 
             WHERE user_id = $1`,
            [userId]
        );

        if (addresses.length === 0) {
            return res.status(404).json({ message: "No addresses found for this user." });
        }

        res.json({ addresses });
    } catch (error) {
        logger.error(`Error fetching addresses for user ${userId}: ${error.message}`);
        res.status(500).json({ success: false, message: "Server error." });
    }
}

const UserTransactions = async (req, res) => {
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
}

const UserDepositHistory = async (req, res) => {
    const { userId } = req.params;

    try {
        const result = await db.query(
            "SELECT * FROM deposits WHERE user_id = $1 ORDER BY created_at DESC",
            [userId]
        );
        
        if (!result || !result) {
            console.error("Database query returned undefined or no rows object.");
            return res.status(500).json({ error: "Unexpected database response" });
        }

        if (result.length === 0) {
            return res.status(404).json({ message: "No deposit history found" });
        }

        return res.status(200).json({ depositHistory: result });
    } catch (error) {
        console.error(`Error fetching deposit history for user ${userId}:`, error.stack);
        res.status(500).json({ error: "Failed to retrieve deposit history", details: error.message });
    }
}

const UserTransactionsHistory =  async (req, res) => {
    const { userId } = req.params;
    try {
        const result = await db.query(
            `SELECT 
    t.transaction_id,
    t.sender_id,
    t.receiver_id,
    t.crypto,
    t.amount,
    t.status,
    t.created_at,
    CASE 
        WHEN t.sender_id = $1 THEN ru.first_name  -- If the user is the sender, get receiver's name
        ELSE su.first_name  -- If the user is the receiver, get sender's name
    END AS receiver_name,
    CASE 
        WHEN t.sender_id = $1 THEN LEFT(ru.first_name, 1)  
        ELSE LEFT(su.first_name, 1)  
    END AS initial,
    (t.sender_id = $1) AS is_outgoing
FROM transactions t
LEFT JOIN users su ON t.sender_id = su.id  -- Sender's info
LEFT JOIN users ru ON t.receiver_id = ru.id  -- Receiver's info
WHERE t.sender_id = $1 OR t.receiver_id = $1
ORDER BY t.created_at DESC;
`,
            [userId]
        );

        if (!result || result.length === 0) {
            console.warn("⚠️ No transactions found for user:", userId);
            return res.status(404).json({ message: "No transactions found" });
        }

        // Transform the result to include initials
        const transactions = result.map(tx => ({
            transactionId: tx.transaction_id,
            senderId: tx.sender_id,
            receiverId: tx.receiver_id,
            crypto: tx.crypto,
            amount: parseFloat(tx.amount),
            status: tx.status,
            createdAt: tx.created_at,
            receiverName: tx.receiver_name || "Unknown",
            initial: tx.receiver_name ? tx.receiver_name.charAt(0).toUpperCase() : "U",
            isOutgoing: tx.sender_id === userId
        }));

        return res.status(200).json({ transactions });
    } catch (error) {
        console.error("❌ Error fetching transactions:", error.stack);
        res.status(500).json({ error: "Internal server error", details: error.message });
    }
}

module.exports = {
    UserRegister,
    UserLogin,
    UserGoogleLogin,
    CheckUser,
    UserGetBalance,
    UserGetDepositAddresses,
    UserTransactions,
    UserDepositHistory,
    UserTransactionsHistory,
};