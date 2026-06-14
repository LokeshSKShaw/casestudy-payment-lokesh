# B2B Payment System

A production-ready Node.js + PostgreSQL B2B Payment system with JWT authentication, asynchronous transaction processing, and background job queue.

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Setup environment
cp .env.example .env
# Edit .env with your database URL and JWT secret

# 3. Database migrations
npm run db:migrate
npm run db:generate

# 4. Start server (Terminal 1)
npm run dev

# 5. Start job worker (Terminal 2)
npm run worker:dev
```

Server: `http://localhost:3000`

---

## Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0
- PostgreSQL >= 12

---

## Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Database Setup

**PostgreSQL locally:**
```bash
createdb wallet_db
# Update DATABASE_URL in .env
```

**Docker:**
```bash
docker run --name wallet-db \
  -e POSTGRES_USER=wallet_user \
  -e POSTGRES_PASSWORD=wallet_pass \
  -e POSTGRES_DB=wallet_db \
  -p 5432:5432 -d postgres:15
```

### 3. Run Migrations
```bash
npm run db:migrate
npm run db:generate
```

### 4. Start Services

Terminal 1 - API Server:
```bash
npm run dev       # Development with auto-reload
npm start         # Production
```

Terminal 2 - Background Worker:
```bash
npm run worker:dev    # Development
npm run worker        # Production
```

---

## Environment Variables

See `.env.example` for all options. Key variables:

```env
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/wallet_db

# JWT (generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
JWT_SECRET=your_super_secret_key_here
JWT_EXPIRY=1h
REFRESH_TOKEN_EXPIRY=30d

# Server
NODE_ENV=development
PORT=3000
LOG_LEVEL=debug

# Password hashing (10 = ~100ms per hash)
BCRYPT_ROUNDS=10

# Jobs
JOB_PROCESSOR_ENABLED=true
JOB_PROCESSOR_INTERVAL_MS=5000
JOB_MAX_RETRIES=3

# CORS
CORS_ORIGIN=http://localhost:3000,http://localhost:3001
```

---

## API Endpoints

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/register` | Register new user (auto-creates wallet) |
| POST | `/auth/login` | Login, get JWT + refresh token |
| POST | `/auth/refresh` | Get new access token |
| POST | `/auth/logout` | Revoke refresh token |

### User
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/users/me` | Get current user profile (protected) |

### Wallet
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/wallets/me` | Get wallet & balance (protected) |
| POST | `/wallets/credit` | Credit wallet (protected) |
| POST | `/wallets/transfer` | Transfer to another wallet (protected) |

### Transactions
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/transactions` | Get paginated history (protected) |
| GET | `/transactions/:id` | Get single transaction (protected) |

---

## Quick Examples

### Register
```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePass123",
    "fullName": "John Doe"
  }'
```

### Login
```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePass123"
  }'
```

### Get Wallet
```bash
curl -X GET http://localhost:3000/wallets/me \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Credit Wallet
```bash
curl -X POST http://localhost:3000/wallets/credit \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 5000,
    "referenceId": "CREDIT-2024-001"
  }'
```

### Transfer
```bash
curl -X POST http://localhost:3000/wallets/transfer \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "toWalletId": "recipient_wallet_id",
    "amount": 2500
  }'
```

---

## Architecture

### Key Design Decisions

| Component | Choice | Why |
|-----------|--------|-----|
| JWT Auth | Stateless (no DB lookup) | Fast, scalable, works across servers |
| Refresh Tokens | Stored in DB (hashed) | Can revoke sessions immediately |
| Transactions | Async via job queue | Fast API response, prevents race conditions |
| Amounts | BigInt (paise) | No floating-point precision errors |
| Job Queue | PostgreSQL (no Redis) | Simple, persistent, no extra infrastructure |
| ORM | Prisma | Type-safe, auto-migrations, great DX |
| Validation | Joi | Declarative, consistent errors |
| Logging | Winston JSON | Works with log aggregation services |

Transaction Flow

```
Client Request
    ↓
Create Pending Transaction + Queue Job
    ↓
Return 202 Accepted (immediate)
    ↓
Background Worker (separate process)
    ├─ Mark as PROCESSING
    ├─ Update wallet balance (atomic DB transaction)
    ├─ Mark transaction SUCCESS
    └─ Next job...
```

Refresh Token Flow

1. Login → Create refresh token, hash it, store in DB
2. Access Token Expires → Client sends refresh token
3. Validate → Find token in DB, check expiry & revocation
4. Refresh → Generate new access token, return
5. Logout → Set `revoked_at` in DB (immediate revocation)

---

Project Structure

```
src/
├── config/
│   └── logger.js              # Winston setup
├── middleware/
│   ├── auth.js                # JWT verification
│   └── errorHandler.js        # Global error handler
├── services/
│   ├── authService.js         # Register, login, refresh
│   ├── walletService.js       # Credit, transfer
│   ├── transactionService.js  # Query history
│   └── jobService.js          # Queue management
├── routes/
│   ├── auth.js
│   ├── users.js
│   ├── wallets.js
│   └── transactions.js
├── jobs/
│   ├── worker.js              # Background processor
│   └── handlers.js            # Job type handlers
├── utils/
│   ├── jwt.js                 # Token generation
│   ├── hash.js                # Password hashing
│   └── response.js            # API responses
└── app.js                     # Express setup
```

---

Job Retry Logic

- Max Retries: 3 attempts (configurable)
- Backoff Strategy: Exponential
  - Attempt 1: Immediate
  - Attempt 2: 1 second later
  - Attempt 3: 2 seconds later
  - Failed after 3: Marked as FAILED in DB

---

 Security

- Passwords: bcryptjs with salt rounds (default 10)
- Tokens: HS256 algorithm, stored in environment
- Refresh Tokens: Hashed in DB, checked on every use
- Database: Prisma prevents SQL injection
- Rate Limiting: 100 requests per 15 seconds globally
- CORS: Configured via environment variable

---

Assumptions

1. Amounts in Paise - ₹1 = 100 paise (JSON returns as strings)
2. Response Codes - 202 for async ops, 201 for creation, 400/401/409 for errors
3. Pagination - Default 20 items, max 100, page 1 is first
4. Reference IDs - Must be unique per transaction, can be client or auto-generated
5. Wallet Balances - Start at 0, never go below 0 (CHECK constraint)
6. One Wallet per User - Auto-created on registration in INR
7. 1-Hour Access Tokens - Can't be instantly revoked (acceptable trade-off)
8. Concurrent Transfers - Handled safely via DB transactions

---

Production Checklist

- [ ] Strong JWT secrets (32+ bytes, random)
- [ ] Database backups automated
- [ ] HTTPS/SSL configured
- [ ] Logging aggregation setup (ELK, Splunk, etc.)
- [ ] Error tracking (Sentry, etc.)
- [ ] Database connection pooling
- [ ] Worker process running separately (PM2, Docker, etc.)
- [ ] Rate limiting per user (not just global)
- [ ] Monitoring & alerts configured
- [ ] Load testing completed

---

Troubleshooting

DB Connection Error:
```bash
psql $DATABASE_URL -c "SELECT 1"  # Test connection
npm run db:reset                   # Reset if needed
```

Worker Not Processing:
```bash
ps aux | grep worker              # Check if running
tail -f logs/app.log              # Check logs
# Verify JOB_PROCESSOR_ENABLED=true in .env
```

Token Errors:
```bash
# Refresh token
curl -X POST http://localhost:3000/auth/refresh \
  -d '{"refreshToken":"YOUR_TOKEN"}'

# Check JWT_SECRET exists
echo $JWT_SECRET | wc -c  # Should be ~65 chars
```

Password Hashing Slow:
```bash
# Reduce BCRYPT_ROUNDS in .env (default 10)
BCRYPT_ROUNDS=8  # Faster but less secure
```

---

## 🔮 Future Improvements

- Redis for job queue (10-100x faster)
- Webhook notifications on transaction events
- Idempotency keys for duplicate prevention
- 2FA authentication
- Soft deletes & audit logging
- API versioning
- Wallet transfer limits (daily/monthly)
- APM monitoring (DataDog, New Relic)
- Comprehensive test suite
- OpenAPI/Swagger docs
  

Resources

- [Prisma](https://www.prisma.io/docs/)
- [Express](https://expressjs.com/)
- [JWT](https://jwt.io/introduction)
- [PostgreSQL](https://www.postgresql.org/docs/)
- [Winston](https://github.com/winstonjs/winston)
- [Joi](https://joi.dev/)
- [bcryptjs](https://github.com/dcodeIO/bcrypt.js)

---

License

MIT

**Version:** 1.0.0 | **Status:** Production Ready ✅


