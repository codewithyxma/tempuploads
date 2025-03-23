const bcrypt = require('bcrypt');

const SALT_ROUNDS = 10;

class Bcrypt {
    /**
     * Hash a password or PIN
     * @param {string} plainText - Password/PIN to hash
     * @returns {Promise<string>} Hashed password/PIN
     */
    static async hash(plainText) {
        try {
            return await bcrypt.hash(plainText, SALT_ROUNDS);
        } catch (error) {
            throw new Error('Password hashing failed');
        }
    }

    /**
     * Compare plain text with hashed value
     * @param {string} plainText - Password/PIN to compare
     * @param {string} hash - Hashed value to compare against
     * @returns {Promise<boolean>} True if match, false otherwise
     */
    static async compare(plainText, hash) {
        try {
            return await bcrypt.compare(plainText, hash);
        } catch (error) {
            throw new Error('Password comparison failed');
        }
    }
}

module.exports = Bcrypt;