const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');
const { v4: uuidv4 } = require('uuid');

module.exports = (sequelize) => {
  const Transaction = sequelize.define('Transaction', {
    transaction_id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    from_wallet_id: {
      type: DataTypes.UUID,
      references: { model: 'wallets', key: 'wallet_id' },
    },
    to_wallet_id: {
      type: DataTypes.UUID,
      references: { model: 'wallets', key: 'wallet_id' },
    },
    amount: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    type: {
      type: DataTypes.ENUM('credit', 'debit', 'transfer'),
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM('pending', 'success', 'failed', 'reversed'),
      allowNull: false,
    },
    reference_id: {
      type: DataTypes.STRING,
      unique: true,
      allowNull: false,
      defaultValue: () => `TXN_${Date.now()}_${uuidv4().slice(0, 8)}`,  // ✅ Auto-generated
      comment: 'Unique transaction reference for customer visibility & idempotency',
    },
    metadata: {
      type: DataTypes.JSONB,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  }, {
    timestamps: false,
    underscored: true,
    tableName: 'transactions',
  });

  return Transaction;
};