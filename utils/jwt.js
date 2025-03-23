const jwt = require('jsonwebtoken');

// Should be in environment variables
const JWT_SECRET = process.env.JWT_SECRET || '';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

class JWT {
    /**
     * Generate JWT token
     * @param {Object} payload - Data to be encoded in token
     * @returns {String} JWT token
     */
    static generateToken(payload) {
        try {
            return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
        } catch (error) {
            throw new Error('Token generation failed');
        }
    }

    /**
     * Verify JWT token
     * @param {String} token - JWT token to verify
     * @returns {Object} Decoded token payload
     */
    static verifyToken(token) {
        try {
            return jwt.verify(token, JWT_SECRET);
        } catch (error) {
            logger.error('Error verifying token:', error);
            throw new Error('Token verification failed');
        }
    }

    /**
     * Middleware to authenticate JWT token
     */
    static authenticateToken(req, res, next) {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

        if (!token) {
            return res.status(401).json({
                status: 401,
                message: 'Access token is required'
            });
        }

        try {
            const decoded = JWTUtil.verifyToken(token);
            req.user = decoded;
            next();
        } catch (error) {
            return res.status(403).json({
                status: 403,
                message: 'Invalid or expired token'
            });
        }
    }
}

module.exports = JWT;