const WalletService = require('../services/wallet.service');
const { v4: uuidv4 } = require('uuid');

class WalletController {
  static async getWallet(req, res) {
    try {
      const userId = req.user.id;
      const wallet = await WalletService.getWalletByUserId(userId);

      return res.status(200).json({
        success: true,
        data: {
          wallet: {
            id: wallet.id,
            balance: wallet.balance,
            currency: wallet.currency,
            updatedAt: wallet.updated_at,
          },
        },
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  static async creditWallet(req, res) {
    try {
      const userId = req.user.id;
      const { amount, referenceId } = req.body;

      // Validate input
      if (!amount || amount <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Amount must be greater than 0',
        });
      }

      if (!referenceId) {
        return res.status(400).json({
          success: false,
          message: 'Reference ID is required',
        });
      }

      const { wallet, transaction } = await WalletService.creditWallet(
        userId,
        amount,
        referenceId,
        { creditedAt: new Date() }
      );

      return res.status(200).json({
        success: true,
        message: 'Wallet credited successfully',
        data: {
          wallet: {
            id: wallet.id,
            balance: wallet.balance,
            currency: wallet.currency,
          },
          transaction: {
            id: transaction.id,
            amount: transaction.amount,
            type: transaction.type,
            status: transaction.status,
            referenceId: transaction.reference_id,
            createdAt: transaction.created_at,
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

  static async transferFunds(req, res) {
    try {
      const fromUserId = req.user.id;
      const { toWalletId, amount } = req.body;

      // Validate input
      if (!toWalletId) {
        return res.status(400).json({
          success: false,
          message: 'Recipient wallet ID is required',
        });
      }

      if (!amount || amount <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Amount must be greater than 0',
        });
      }

      // Generate reference ID for idempotency
      const referenceId = uuidv4();

      const { fromWallet, toWallet, transaction } = await WalletService.transferFunds(
        fromUserId,
        toWalletId,
        amount,
        referenceId,
        { transferredAt: new Date() }
      );

      return res.status(200).json({
        success: true,
        message: 'Transfer successful',
        data: {
          fromWallet: {
            id: fromWallet.id,
            balance: fromWallet.balance,
          },
          toWallet: {
            id: toWallet.id,
            balance: toWallet.balance,
          },
          transaction: {
            id: transaction.id,
            amount: transaction.amount,
            type: transaction.type,
            status: transaction.status,
            referenceId: transaction.reference_id,
            createdAt: transaction.created_at,
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

  static async debitWallet(req, res) {
    try {
      const userId = req.user.id;
      const { amount, referenceId } = req.body;

      // Validate input
      if (!amount || amount <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Amount must be greater than 0',
        });
      }

      if (!referenceId) {
        return res.status(400).json({
          success: false,
          message: 'Reference ID is required',
        });
      }

      const { wallet, transaction } = await WalletService.debitWallet(
        userId,
        amount,
        referenceId,
        { debitedAt: new Date() }
      );

      return res.status(200).json({
        success: true,
        message: 'Wallet debited successfully',
        data: {
          wallet: {
            id: wallet.id,
            balance: wallet.balance,
          },
          transaction: {
            id: transaction.id,
            amount: transaction.amount,
            type: transaction.type,
            status: transaction.status,
            referenceId: transaction.reference_id,
            createdAt: transaction.created_at,
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
}

module.exports = WalletController;