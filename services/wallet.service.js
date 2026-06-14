const { Wallet } = require('../models/wallet');
const { User } = require('../models/user');
const { Transaction } = require('../models/transaction');

const sequelize = require('../config/db');

class WalletService {
  static async getWalletByUserId(userId) {
    const wallet = await Wallet.findOne({
      where: { user_id: userId },
      include: [{ model: User, as: 'user', attributes: ['id', 'email', 'full_name'] }],
    });

    if (!wallet) {
      throw new Error('Wallet not found');
    }

    return wallet;
  }

  static async creditWallet(userId, amount, referenceId, metadata = {}) {
    // Use transaction to ensure atomicity
    const t = await sequelize.transaction();

    try {
      // Check if reference_id already exists (idempotency)
      const existingTransaction = await Transaction.findOne({
        where: { reference_id: referenceId },
        transaction: t,
      });

      if (existingTransaction) {
        throw new Error('Transaction with this reference ID already exists');
      }

      // Get wallet
      const wallet = await Wallet.findOne({
        where: { user_id: userId },
        transaction: t,
        lock: true, // Lock for update to prevent race conditions
      });

      if (!wallet) {
        throw new Error('Wallet not found');
      }

      // Update wallet balance
      wallet.balance += amount;
      wallet.updated_at = new Date();
      await wallet.save({ transaction: t });

      // Create transaction record
      const transaction = await Transaction.create(
        {
          to_wallet_id: wallet.id,
          amount,
          type: 'credit',
          status: 'success',
          reference_id: referenceId,
          metadata,
        },
        { transaction: t }
      );

      await t.commit();

      return {
        wallet,
        transaction,
      };
    } catch (error) {
      await t.rollback();
      throw error;
    }
  }

  static async transferFunds(fromUserId, toWalletId, amount, referenceId, metadata = {}) {
    // Use transaction to ensure atomicity
    const t = await sequelize.transaction();

    try {
      // Check if reference_id already exists (idempotency)
      const existingTransaction = await Transaction.findOne({
        where: { reference_id: referenceId },
        transaction: t,
      });

      if (existingTransaction) {
        throw new Error('Transaction with this reference ID already exists');
      }

      // Get sender's wallet
      const fromWallet = await Wallet.findOne({
        where: { user_id: fromUserId },
        transaction: t,
        lock: true,
      });

      if (!fromWallet) {
        throw new Error('Sender wallet not found');
      }

      // Get receiver's wallet
      const toWallet = await Wallet.findOne({
        where: { id: toWalletId },
        transaction: t,
        lock: true,
      });

      if (!toWallet) {
        throw new Error('Recipient wallet not found');
      }

      // Check sufficient balance
      if (fromWallet.balance < amount) {
        throw new Error('Insufficient balance');
      }

      // Update sender balance
      fromWallet.balance -= amount;
      fromWallet.updated_at = new Date();
      await fromWallet.save({ transaction: t });

      // Update receiver balance
      toWallet.balance += amount;
      toWallet.updated_at = new Date();
      await toWallet.save({ transaction: t });

      // Create transaction record
      const transaction = await Transaction.create(
        {
          from_wallet_id: fromWallet.id,
          to_wallet_id: toWallet.id,
          amount,
          type: 'transfer',
          status: 'success',
          reference_id: referenceId,
          metadata,
        },
        { transaction: t }
      );

      await t.commit();

      return {
        fromWallet,
        toWallet,
        transaction,
      };
    } catch (error) {
      await t.rollback();
      throw error;
    }
  }

  static async debitWallet(userId, amount, referenceId, metadata = {}) {
    const t = await sequelize.transaction();

    try {
      // Check if reference_id already exists
      const existingTransaction = await Transaction.findOne({
        where: { reference_id: referenceId },
        transaction: t,
      });

      if (existingTransaction) {
        throw new Error('Transaction with this reference ID already exists');
      }

      // Get wallet
      const wallet = await Wallet.findOne({
        where: { user_id: userId },
        transaction: t,
        lock: true,
      });

      if (!wallet) {
        throw new Error('Wallet not found');
      }

      // Check sufficient balance
      if (wallet.balance < amount) {
        throw new Error('Insufficient balance');
      }

      // Update wallet balance
      wallet.balance -= amount;
      wallet.updated_at = new Date();
      await wallet.save({ transaction: t });

      // Create transaction record
      const transaction = await Transaction.create(
        {
          from_wallet_id: wallet.id,
          amount,
          type: 'debit',
          status: 'success',
          reference_id: referenceId,
          metadata,
        },
        { transaction: t }
      );

      await t.commit();

      return {
        wallet,
        transaction,
      };
    } catch (error) {
      await t.rollback();
      throw error;
    }
  }
}

module.exports = WalletService;