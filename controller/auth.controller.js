const AuthService = require('../services/auth.service');

class AuthController {
  static async register(req, res) {
    try {
      const { email, password, fullName, phoneNumber } = req.body;

      // Validate required fields
      if (!email || !password || !fullName) {
        return res.status(400).json({
          success: false,
          message: 'Email, password, and full name are required',
        });
      }

      const user = await AuthService.register(email, password, fullName, phoneNumber);

      return res.status(201).json({
        success: true,
        message: 'User registered successfully',
        data: {
          user: {
            id: user.id,
            email: user.email,
            fullName: user.full_name,
            phoneNumber: user.phone_number,
            createdAt: user.created_at,
          },
        },
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }

  static async login(req, res) {
    try {
      const { email, password } = req.body;

      // Validate required fields
      if (!email || !password) {
        return res.status(400).json({
          success: false,
          message: 'Email and password are required',
        });
      }

      const { user, accessToken, refreshToken, expiresIn } = await AuthService.login(
        email,
        password
      );

      // Set refresh token as httpOnly cookie
      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      });

      return res.status(200).json({
        success: true,
        message: 'Login successful',
        data: {
          user: {
            id: user.id,
            email: user.email,
            fullName: user.full_name,
            phoneNumber: user.phone_number,
          },
          accessToken,
          refreshToken, // Also return it in body for flexibility
          expiresIn,
        },
      });
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: error.message,
      });
    }
  }

  static async logout(req, res) {
    try {
      const userId = req.user.id;
      const { refreshToken } = req.body;

      if (!refreshToken) {
        return res.status(400).json({
          success: false,
          message: 'Refresh token is required',
        });
      }

      await AuthService.logout(userId, refreshToken);

      // Clear refresh token cookie
      res.clearCookie('refreshToken');

      return res.status(200).json({
        success: true,
        message: 'Logout successful',
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }

  static async refreshToken(req, res) {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        return res.status(400).json({
          success: false,
          message: 'Refresh token is required',
        });
      }

      const { accessToken, expiresIn } = await AuthService.refreshAccessToken(refreshToken);

      return res.status(200).json({
        success: true,
        message: 'Token refreshed successfully',
        data: {
          accessToken,
          expiresIn,
        },
      });
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: error.message,
      });
    }
  }
}

module.exports = AuthController;