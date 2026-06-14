const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const ACCESS_TOKEN_EXPIRY = '1h'; // 1 hour
const REFRESH_TOKEN_EXPIRY = '7d'; // 7 days

class Jwt {
  // Generate access token (short-lived, not stored in DB)
  static generateAccessToken(userId) {
    return jwt.sign(
      { userId, type: 'access' },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: ACCESS_TOKEN_EXPIRY }
    );
  }

  // Generate refresh token (long-lived, stored in DB)
  static generateRefreshToken(userId) {
    const token = jwt.sign(
      { userId, type: 'refresh' },
      process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key',
      { expiresIn: REFRESH_TOKEN_EXPIRY }
    );
    return token;
  }

  // Hash the refresh token before storing in DB
  static hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  // Verify access token
  static verifyAccessToken(token) {
    try {
      return jwt.verify(
        token,
        process.env.JWT_SECRET || 'your-secret-key'
      );
    } catch (error) {
      return null;
    }
  }

  // Verify refresh token
  static verifyRefreshToken(token) {
    try {
      return jwt.verify(
        token,
        process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key'
      );
    } catch (error) {
      return null;
    }
  }

  // Get expiry timestamp for refresh token (7 days from now)
  static getRefreshTokenExpiry() {
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 7);
    return expiryDate;
  }
}

module.exports = Jwt;