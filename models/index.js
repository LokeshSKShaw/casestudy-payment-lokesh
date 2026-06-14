const sequelize = require('../config/db');

const User = require('./user')(sequelize);
const Wallet = require('./wallet')(sequelize);
const RefreshToken = require('./refreshToken')(sequelize);
const Transaction = require('./transaction')(sequelize);
const Job = require('./job')(sequelize);

// User ↔ Wallet (One-to-One)
User.hasOne(Wallet, {
  foreignKey: 'user_id',
  as: 'wallet'
});

Wallet.belongsTo(User, {
  foreignKey: 'user_id',
  as: 'user'
});

module.exports = {
  sequelize,
  User,
  Wallet,
  RefreshToken,
  Transaction,
  Job,
};