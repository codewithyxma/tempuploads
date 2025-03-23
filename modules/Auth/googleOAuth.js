const { OAuth2Client } = require('google-auth-library');
const { logger } = require('../../services/logger/logger');

class GoogleAuth {
    constructor() {
        this.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
        if (!this.GOOGLE_CLIENT_ID) {
            throw new Error('GOOGLE_CLIENT_ID environment variable is required');
        }
        this.client = new OAuth2Client(this.GOOGLE_CLIENT_ID);
    }

    async verifyToken(token) {
        try {
            const ticket = await this.client.verifyIdToken({
                idToken: token,
                audience: this.GOOGLE_CLIENT_ID
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

module.exports = new GoogleAuth();