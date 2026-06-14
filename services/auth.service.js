const { User } = require('../models/user');
const { Wallet } = require('../models/wallet');
const { RefreshToken } = require('../models/refreshToken');
const PasswordUtil = require('../utils/password');
const JWTUtil = require('../utils/jwt');

class AuthService {
  static async register(email, password, fullName, phoneNumber) {
    // Check if user already exists
    const existingUser = await User.findOne({ where: { email: email.toLowerCase() } });
    if (existingUser) {
      throw new Error('Email already registered');
    }

    // Validate password
    if (!PasswordUtil.validatePassword(password)) {
      throw new Error(
        'Password must be at least 8 characters with uppercase, lowercase, and numbers'
      );
    }

    // Hash password
    const passwordHash = await PasswordUtil.hashPassword(password);

    // Create user
    const user = await User.create({
      email: email.toLowerCase(),
      password_hash: passwordHash,
      full_name: fullName,
      phone_number: phoneNumber,
      is_active: true,
    });

    // Auto-create wallet for user
    await Wallet.create({
      user_id: user.id,
      balance: 0,
      currency: 'INR',
    });

    return user;
  }

  static async login(email, password) {
    // Find user by email
    const user = await User.findOne({ where: { email: email.toLowerCase() } });
    if (!user) {
      throw new Error('Invalid email or password');
    }

    // Check if user is active
    if (!user.is_active) {
      throw new Error('User account is inactive');
    }

    // Verify password
    const isPasswordValid = await PasswordUtil.comparePassword(password, user.password_hash);
    if (!isPasswordValid) {
      throw new Error('Invalid email or password');
    }

    // Generate tokens
    const accessToken = JWTUtil.generateAccessToken(user.id);
    const refreshToken = JWTUtil.generateRefreshToken(user.id);
    const refreshTokenHash = JWTUtil.hashToken(refreshToken);

    // Store refresh token in database
    await RefreshToken.create({
      user_id: user.id,
      token_hash: refreshTokenHash,
      expires_at: JWTUtil.getRefreshTokenExpiry(),
    });

    return {
      user,
      accessToken,
      refreshToken,
      expiresIn: '1h',
    };
  }

  static async logout(userId, refreshToken) {
    // Hash the refresh token to find it in DB
    const refreshTokenHash = JWTUtil.hashToken(refreshToken);

    // Find and revoke the refresh token
    const storedToken = await RefreshToken.findOne({
      where: { token_hash: refreshTokenHash, user_id: userId },
    });

    if (!storedToken) {
      throw new Error('Refresh token not found');
    }

    // Mark as revoked
    await storedToken.update({ revoked_at: new Date() });

    return { success: true };
  }

  static async refreshAccessToken(refreshToken) {
    // Verify the refresh token
    const decoded = JWTUtil.verifyRefreshToken(refreshToken);
    if (!decoded) {
      throw new Error('Invalid or expired refresh token');
    }

    // Check if token exists in database and is not revoked
    const refreshTokenHash = JWTUtil.hashToken(refreshToken);
    const storedToken = await RefreshToken.findOne({
      where: { token_hash: refreshTokenHash, user_id: decoded.userId },
    });

    if (!storedToken || storedToken.revoked_at) {
      throw new Error('Refresh token has been revoked');
    }

    // Check if token is expired
    if (new Date() > storedToken.expires_at) {
      throw new Error('Refresh token has expired');
    }

    // Generate new access token
    const newAccessToken = JWTUtil.generateAccessToken(decoded.userId);

    return {
      accessToken: newAccessToken,
      expiresIn: '1h',
    };
  }
}

module.exports = AuthService;