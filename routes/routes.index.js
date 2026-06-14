const express = require('express');
const AuthController = require('../controller/auth.controller');
const UserController = require('../controller/user.controller');
const WalletController = require('../controller/wallet.controller');
const TransactionController = require('../controller/transaction.controller');
const AuthMiddleware = require('../middleware/auth');

const router = express.Router();

// ========== AUTH ROUTES ==========
router.post('/auth/register', AuthController.register);
router.post('/auth/login', AuthController.login);
router.post('/auth/logout', AuthMiddleware.authenticate, AuthController.logout);
router.post('/auth/refresh', AuthController.refreshToken);

// ========== USER ROUTES ==========
router.get('/users/me', AuthMiddleware.authenticate, UserController.getCurrentUser);
router.put('/users/me', AuthMiddleware.authenticate, UserController.updateUser);

// ========== WALLET ROUTES ==========
router.get('/wallets/me', AuthMiddleware.authenticate, WalletController.getWallet);
router.post('/wallets/credit', AuthMiddleware.authenticate, WalletController.creditWallet);
router.post('/wallets/debit', AuthMiddleware.authenticate, WalletController.debitWallet);
router.post('/wallets/transfer', AuthMiddleware.authenticate, WalletController.transferFunds);

// ========== TRANSACTION ROUTES ==========
router.get('/transactions', AuthMiddleware.authenticate, TransactionController.getUserTransactions);
router.get(
  '/transactions/:id',
  AuthMiddleware.authenticate,
  TransactionController.getTransactionById
);
router.get(
  '/transactions/by-status/:status',
  AuthMiddleware.authenticate,
  TransactionController.getTransactionsByStatus
);

module.exports = router;