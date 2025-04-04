const jwt = require('jsonwebtoken');
const { logger } = require('../services/logger/logger');
const dotenv = require('dotenv');
dotenv.config();

class JWT {
    // Change private fields to regular static properties
    static JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
    static TOKEN_EXPIRY = '7d';
    static REFRESH_TOKEN_EXPIRY = '30d';

    static generateToken(payload) {
        try {
            return jwt.sign(payload, this.JWT_SECRET, {
                expiresIn: this.TOKEN_EXPIRY,
                algorithm: 'HS256'
            });
        } catch (error) {
            logger.error('Token generation failed:', error);
            throw new Error('Token generation failed');
        }
    }

    static generateRefreshToken(payload) {
        try {
            return jwt.sign(payload, this.JWT_SECRET, {
                expiresIn: this.REFRESH_TOKEN_EXPIRY,
                algorithm: 'HS256'
            });
        } catch (error) {
            logger.error('Refresh token generation failed:', error);
            throw new Error('Refresh token generation failed');
        }
    }

    static verifyToken(token) {
        try {
            return jwt.verify(token, this.JWT_SECRET);
        } catch (error) {
            logger.error('Token verification failed:', error);
            if (error.name === 'TokenExpiredError') {
                throw new Error('Token has expired');
            }
            throw new Error('Invalid token');
        }
    }

    static authenticateToken(req, res, next) {
        try {
            const authHeader = req.headers['authorization'];
            if (!authHeader) {
                logger.warn('No authorization header');
                return res.status(401).json({
                    success: false,
                    message: 'Access denied'
                });
            }

            const [bearer, token] = authHeader.split(' ');
            logger.info(`Authorization header: ${authHeader}`);
            
            if (bearer !== 'Bearer' || !token) {
                logger.warn('Invalid token format');
                return res.status(401).json({
                    success: false,
                    message: 'Invalid token'
                });
            }

            try {
                // Use verifyToken method instead of direct jwt.verify
                const decoded = JWT.verifyToken(token);
                logger.info(`Token verified for user: ${decoded.userId}`);

                // Verify user ID matches route parameter
                if (req.params.userId && req.params.userId !== decoded.userId) {
                    logger.warn(`User ID mismatch: ${req.params.userId} != ${decoded.userId}`);
                    return res.status(403).json({
                        success: false,
                        message: 'Unauthorized access'
                    });
                }

                req.user = decoded;
                next();
            } catch (tokenError) {
                logger.error('Token verification failed:', tokenError);
                return res.status(403).json({
                    success: false,
                    message: 'Authentication failed'
                });
            }
        } catch (error) {
            logger.error('Authentication failed:', error);
            return res.status(500).json({
                success: false,
                message: 'Internal server error'
            });
        }
    }

    static async revokeToken(userId) {
        try {
            // Add token to blacklist in database or Redis
            await config.redis.set(`blacklist:${userId}`, Date.now());
            await config.redis.expire(`blacklist:${userId}`, 604800); // 7 days
            logger.info(`Token revoked for user: ${userId}`);
        } catch (error) {
            logger.error('Token revocation failed:', error);
            throw new Error('Failed to revoke token');
        }
    }

    static isTokenBlacklisted(userId) {
        return config.redis.exists(`blacklist:${userId}`);
    }
}

module.exports = JWT;