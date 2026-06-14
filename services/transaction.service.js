const { Wallet } = require('../models/wallet');
const { User } = require('../models/user');
const { Transaction } = require('../models/transaction');
const { Op } = require('sequelize');

class TransactionService {
  static async getUserTransactions(userId, page = 1, limit = 10) {
    // Get user's wallet first
    const wallet = await Wallet.findOne({
      where: { user_id: userId },
    });

    if (!wallet) {
      throw new Error('Wallet not found');
    }

    // Find all transactions where user is either sender or receiver
    const offset = (page - 1) * limit;

    const { count, rows } = await Transaction.findAndCountAll({
      where: {
        [Op.or]: [
          { from_wallet_id: wallet.id },
          { to_wallet_id: wallet.id },
        ],
      },
      include: [
        {
          model: Wallet,
          as: 'fromWallet',
          attributes: ['id', 'user_id'],
          include: [
            {
              model: User,
              as: 'user',
              attributes: ['id', 'email', 'full_name'],
            },
          ],
        },
        {
          model: Wallet,
          as: 'toWallet',
          attributes: ['id', 'user_id'],
          include: [
            {
              model: User,
              as: 'user',
              attributes: ['id', 'email', 'full_name'],
            },
          ],
        },
      ],
      order: [['created_at', 'DESC']],
      limit,
      offset,
      subQuery: false,
    });

    return {
      transactions: rows,
      pagination: {
        page,
        limit,
        total: count,
        totalPages: Math.ceil(count / limit),
      },
    };
  }

  static async getTransactionById(transactionId, userId) {
    // Get user's wallet
    const wallet = await Wallet.findOne({
      where: { user_id: userId },
    });

    if (!wallet) {
      throw new Error('Wallet not found');
    }

    // Find transaction and verify user has access
    const transaction = await Transaction.findOne({
      where: {
        id: transactionId,
        [Op.or]: [
          { from_wallet_id: wallet.id },
          { to_wallet_id: wallet.id },
        ],
      },
      include: [
        {
          model: Wallet,
          as: 'fromWallet',
          include: [
            {
              model: User,
              as: 'user',
              attributes: ['id', 'email', 'full_name'],
            },
          ],
        },
        {
          model: Wallet,
          as: 'toWallet',
          include: [
            {
              model: User,
              as: 'user',
              attributes: ['id', 'email', 'full_name'],
            },
          ],
        },
      ],
    });

    if (!transaction) {
      throw new Error('Transaction not found or access denied');
    }

    return transaction;
  }

  static async getTransactionsByStatus(userId, status, page = 1, limit = 10) {
    const wallet = await Wallet.findOne({
      where: { user_id: userId },
    });

    if (!wallet) {
      throw new Error('Wallet not found');
    }

    const offset = (page - 1) * limit;

    const { count, rows } = await Transaction.findAndCountAll({
      where: {
        status,
        [Op.or]: [
          { from_wallet_id: wallet.id },
          { to_wallet_id: wallet.id },
        ],
      },
      include: [
        {
          model: Wallet,
          as: 'fromWallet',
          attributes: ['id', 'user_id'],
          include: [
            {
              model: User,
              as: 'user',
              attributes: ['id', 'email', 'full_name'],
            },
          ],
        },
        {
          model: Wallet,
          as: 'toWallet',
          attributes: ['id', 'user_id'],
          include: [
            {
              model: User,
              as: 'user',
              attributes: ['id', 'email', 'full_name'],
            },
          ],
        },
      ],
      order: [['created_at', 'DESC']],
      limit,
      offset,
      subQuery: false,
    });

    return {
      transactions: rows,
      pagination: {
        page,
        limit,
        total: count,
        totalPages: Math.ceil(count / limit),
      },
    };
  }
}

module.exports = TransactionService;