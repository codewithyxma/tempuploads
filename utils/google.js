const { OAuth2Client } = require('google-auth-library');
const { logger } = require('../services/logger/logger');

require('dotenv').config();

class GoogleUtil {
    constructor() {
        if (!process.env.GOOGLE_CLIENT_ID) {
            throw new Error('GOOGLE_CLIENT_ID environment variable is missing');
        }
        this.client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
    }

    async verifyToken(idToken) {
        try {
            const ticket = await this.client.verifyIdToken({
                idToken,
                audience: process.env.GOOGLE_CLIENT_ID
            });
            
            const payload = ticket.getPayload();
            return {
                email: payload.email,
                email_verified: payload.email_verified,
                google_id: payload.sub,
                name: payload.name,
                picture: payload.picture
            };
        } catch (error) {
            logger.error('Google token verification failed:', error);
            throw new Error('Invalid Google token');
        }
    }
}

module.exports = new GoogleUtil();