const TransactionService = require('../services/transaction.service');

class TransactionController {
  static async getUserTransactions(req, res) {
    try {
      const userId = req.user.id;
      const { page = 1, limit = 10 } = req.query;

      // Validate pagination
      const pageNum = Math.max(1, parseInt(page));
      const limitNum = Math.min(100, Math.max(1, parseInt(limit)));

      const result = await TransactionService.getUserTransactions(userId, pageNum, limitNum);

      return res.status(200).json({
        success: true,
        data: {
          transactions: result.transactions.map((tx) => ({
            id: tx.id,
            from: tx.fromWallet
              ? {
                  walletId: tx.fromWallet.id,
                  user: tx.fromWallet.user,
                }
              : null,
            to: tx.toWallet
              ? {
                  walletId: tx.toWallet.id,
                  user: tx.toWallet.user,
                }
              : null,
            amount: tx.amount,
            type: tx.type,
            status: tx.status,
            referenceId: tx.reference_id,
            metadata: tx.metadata,
            createdAt: tx.created_at,
          })),
          pagination: result.pagination,
        },
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  static async getTransactionById(req, res) {
    try {
      const userId = req.user.id;
      const { id } = req.params;

      const transaction = await TransactionService.getTransactionById(id, userId);

      return res.status(200).json({
        success: true,
        data: {
          transaction: {
            id: transaction.id,
            from: transaction.fromWallet
              ? {
                  walletId: transaction.fromWallet.id,
                  user: transaction.fromWallet.user,
                }
              : null,
            to: transaction.toWallet
              ? {
                  walletId: transaction.toWallet.id,
                  user: transaction.toWallet.user,
                }
              : null,
            amount: transaction.amount,
            type: transaction.type,
            status: transaction.status,
            referenceId: transaction.reference_id,
            metadata: transaction.metadata,
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

  static async getTransactionsByStatus(req, res) {
    try {
      const userId = req.user.id;
      const { status, page = 1, limit = 10 } = req.query;

      if (!status) {
        return res.status(400).json({
          success: false,
          message: 'Status query parameter is required',
        });
      }

      const validStatuses = ['pending', 'success', 'failed', 'reversed'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
        });
      }

      const pageNum = Math.max(1, parseInt(page));
      const limitNum = Math.min(100, Math.max(1, parseInt(limit)));

      const result = await TransactionService.getTransactionsByStatus(
        userId,
        status,
        pageNum,
        limitNum
      );

      return res.status(200).json({
        success: true,
        data: {
          transactions: result.transactions.map((tx) => ({
            id: tx.id,
            from: tx.fromWallet
              ? {
                  walletId: tx.fromWallet.id,
                  user: tx.fromWallet.user,
                }
              : null,
            to: tx.toWallet
              ? {
                  walletId: tx.toWallet.id,
                  user: tx.toWallet.user,
                }
              : null,
            amount: tx.amount,
            type: tx.type,
            status: tx.status,
            referenceId: tx.reference_id,
            metadata: tx.metadata,
            createdAt: tx.created_at,
          })),
          pagination: result.pagination,
        },
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
}

module.exports = TransactionController;