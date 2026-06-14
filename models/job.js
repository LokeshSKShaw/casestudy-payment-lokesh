const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

module.exports = (sequelize) => {
  const Job = sequelize.define('Job', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    type: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    payload: {
      type: DataTypes.JSONB,
    },
    status: {
      type: DataTypes.ENUM('queued', 'processing', 'done', 'failed'),
      defaultValue: 'queued',
    },
    attempts: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    next_retry_at: {
      type: DataTypes.DATE,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  }, {
    timestamps: true,
    underscored: true,
    tableName: 'jobs',
  indexes: [
    {
      fields: ['status', 'next_retry_at'],
      name: 'idx_jobs_status_retry',
    },
  ],
  });

  return Job;
};