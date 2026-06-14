const { User } = require('../models/user');

class UserController {
  static async getCurrentUser(req, res) {
    try {
      const user = req.user;

      return res.status(200).json({
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            fullName: user.full_name,
            phoneNumber: user.phone_number,
            isActive: user.is_active,
            createdAt: user.created_at,
            updatedAt: user.updated_at,
          },
        },
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Error fetching user profile',
        error: error.message,
      });
    }
  }

  static async updateUser(req, res) {
    try {
      const userId = req.user.id;
      const { fullName, phoneNumber } = req.body;

      const user = await User.findByPk(userId);

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found',
        });
      }

      // Update allowed fields
      if (fullName) user.full_name = fullName;
      if (phoneNumber) user.phone_number = phoneNumber;

      user.updated_at = new Date();
      await user.save();

      return res.status(200).json({
        success: true,
        message: 'User updated successfully',
        data: {
          user: {
            id: user.id,
            email: user.email,
            fullName: user.full_name,
            phoneNumber: user.phone_number,
            isActive: user.is_active,
            createdAt: user.created_at,
            updatedAt: user.updated_at,
          },
        },
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Error updating user',
        error: error.message,
      });
    }
  }
}

module.exports = UserController;