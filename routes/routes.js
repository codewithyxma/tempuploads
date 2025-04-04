const express = require('express');
const router = express.Router();
const JWT = require('../utils/jwt');
const { UserRegister, UserLogin, CheckUser, UserGoogleLogin, UserGetBalance, UserGetDepositAddresses, UserTransactions, UserDepositHistory, UserTransactionsHistory } = require('../modules/Users/user_routes');

router.get('/', (req, res) => {
    return res.status(401).json({
        message: 'Access Denied',
    });
});

router.post("/register", UserRegister);

router.post("/login", UserLogin);

router.post("/google-login", UserGoogleLogin);

router.post('/check-user', CheckUser);

router.get("/:userId/balance", JWT.authenticateToken, UserGetBalance);

router.get('/:userId/transactions', JWT.authenticateToken, UserTransactions);

router.get("/:userId/deposit/history", JWT.authenticateToken, UserDepositHistory);

router.get("/:userId/transactions/history", JWT.authenticateToken, UserTransactionsHistory);

router.get("/:userId/wallet/addresses/", JWT.authenticateToken ,UserGetDepositAddresses);

module.exports = router; 