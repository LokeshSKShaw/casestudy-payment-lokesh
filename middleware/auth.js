const JWTUtil = require('../utils/jwt');
const { User } = require('../models/user');

class Auth{
  static async authenticate(req, res, next) {
    try {
      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          success: false,
          message: 'Missing or invalid authorization header',
        });
      }

      const token = authHeader.substring(7); // Remove 'Bearer '
      const decoded = JWTUtil.verifyAccessToken(token);

      if (!decoded) {
        return res.status(401).json({
          success: false,
          message: 'Invalid or expired token',
        });
      }

      // Fetch user from database to ensure they still exist and are active
      const user = await User.findByPk(decoded.userId);

      if (!user || !user.is_active) {
        return res.status(401).json({
          success: false,
          message: 'User not found or inactive',
        });
      }

      // Attach user to request object
      req.user = user;
      next();
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Authentication error',
        error: error.message,
      });
    }
  }
}

module.exports = Auth;