# System Design - Wallet Management System

This document describes the complete system architecture, components, data flow, and design decisions.

---

## 📐 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    API SERVER (Express.js)                       │
│                      (Port 3000)                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Routes: /auth, /users, /wallets, /transactions          │   │
│  │  Middleware: Auth, Validation, Error Handler             │   │
│  │  Services: Business logic for each domain                │   │
│  └──────────────────────────────────────────────────────────┘   │
└────────────┬────────────────────────────────────────────────────┘
             │
             │ Prisma Client
             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    PostgreSQL Database                           │
│  Tables: users, wallets, transactions, refresh_tokens, jobs     │
│  Indexes: Status, createdAt, userId, walletId                   │
└─────────────────────────────────────────────────────────────────┘
             ▲
             │
             │ (Async Queue)
             │
┌────────────┴────────────────────────────────────────────────────┐
│              BACKGROUND JOB WORKER (Separate Process)            │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ Job Processor:                                           │   │
│  │ - Poll jobs table every 5 seconds                        │   │
│  │ - Process: credit_wallet, transfer_funds, reverse       │   │
│  │ - Update transactions & wallet balances                  │   │
│  │ - Retry with exponential backoff                         │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔄 Request Flow - Transaction Lifecycle

### Credit Wallet Flow

```
┌──────────────────────────────────────┐
│   API Server (Route Handler)          │
│ 1. Validate input (Joi)               │
│ 2. Verify wallet exists               │
│ 3. Check unique reference_id          │
└──────────┬──────────────────────────┘
           │
           ▼
┌──────────────────────────────────────┐
│   Wallet Service                      │
│ 1. Create Transaction (PENDING)       │
│ 2. Queue Job (credit_wallet)          │
│ 3. Return Transaction ID              │
└──────────┬──────────────────────────┘
           │
           ▼
┌──────────────────────────────────────┐
│   Database (Atomic Transaction)       │
│ 1. INSERT transaction (PENDING)       │
│ 2. INSERT job (QUEUED)                │
│ 3. COMMIT                             │
└──────────────────────────────────────┘

═════════════════════════════════════════════════════════════════

Meanwhile in Background Worker (Async):

┌──────────────────────────────────────┐
│   Job Processor                       │
│ 1. Poll jobs (status=QUEUED)          │
│ 2. Mark job PROCESSING                │
└──────────┬──────────────────────────┘
           │
           ▼
┌──────────────────────────────────────┐
│   Job Handler (credit_wallet)         │
│ 1. Find transaction by ID             │
│ 2. Update wallet balance:             │
│    balance += amount                  │
│ 3. Mark transaction SUCCESS           │
└──────────┬──────────────────────────┘
           │
           ▼
┌──────────────────────────────────────┐
│   Database (Atomic Transaction)       │
│ 1. UPDATE wallet SET balance += amt   │
│ 2. UPDATE transaction SET SUCCESS     │
│ 3. UPDATE job SET DONE                │
│ 4. COMMIT (all or nothing)            │
└──────────┬──────────────────────────┘
           │
           ▼
┌──────────────────────────────────────┐
│   Job Complete                        │
└──────────────────────────────────────┘
```

### Transfer Flow (More Complex)

```
Wallet Service:
  1. Validate inputs
  2. Check sender balance >= amount
  3. Check recipient wallet exists
  4. Create Transaction (PENDING)
  5. Queue Job (transfer_funds)
  6. Return 202 Accepted
       │
       ▼
Background Worker (Async):
  
  DB Transaction (SERIALIZABLE):
    ├─ Lock sender wallet
    ├─ Lock recipient wallet
    ├─ Check sender balance >= amount (again)
    ├─ UPDATE sender wallet: balance -= amount
    ├─ UPDATE recipient wallet: balance += amount
    ├─ UPDATE transaction: status = SUCCESS
    └─ COMMIT (atomic)
       │
       └─ If fails: ROLLBACK, mark job FAILED
```

---

## 📊 Database Schema

### Entity Relationship Diagram

```
┌────────────────┐
│     USERS      │
├────────────────┤
│ id (PK)        │
│ email (UNIQUE) │
│ password_hash  │
│ fullName       │
│ phoneNumber    │
│ isActive       │
│ createdAt      │
│ updatedAt      │
└────────┬───────┘
         │ 1:1
         ├──────────────────┐
         │                  │
         ▼                  ▼
    ┌────────────┐    ┌──────────────────┐
    │  WALLETS   │    │ REFRESH_TOKENS   │
    ├────────────┤    ├──────────────────┤
    │ id (PK)    │    │ id (PK)          │
    │ userId(FK) │    │ userId(FK)       │
    │ balance    │    │ tokenHash(UNIQUE)│
    │ currency   │    │ expiresAt        │
    │ updatedAt  │    │ revokedAt        │
    └────┬───────┘    │ createdAt        │
         │            └──────────────────┘
         │ 1:N
         └──────────┐
                    ▼
            ┌──────────────────┐
            │   TRANSACTIONS   │
            ├──────────────────┤
            │ id (PK)          │
            │ fromWalletId(FK) │
            │ toWalletId(FK)   │
            │ amount           │
            │ type (ENUM)      │
            │ status (ENUM)    │
            │ referenceId(UQ)  │
            │ metadata(JSONB)  │
            │ createdAt        │
            └──────────────────┘

┌────────────────┐
│     JOBS       │
├────────────────┤
│ id (PK)        │
│ type           │
│ payload(JSONB) │
│ status(ENUM)   │
│ attempts       │
│ nextRetryAt    │
│ error(TEXT)    │
│ createdAt      │
│ updatedAt      │
└────────────────┘
```

### Key Constraints

```sql
-- Wallet balance always >= 0
ALTER TABLE wallets ADD CONSTRAINT wallets_balance_check 
  CHECK (balance >= 0);

-- One wallet per user
ALTER TABLE wallets ADD CONSTRAINT wallets_user_unique 
  UNIQUE (user_id);

-- Transaction reference is unique
ALTER TABLE transactions ADD CONSTRAINT transactions_ref_unique 
  UNIQUE (reference_id);

-- Refresh token hash is unique
ALTER TABLE refresh_tokens ADD CONSTRAINT tokens_hash_unique 
  UNIQUE (token_hash);
```

---

## 🔐 Authentication Flow

### Register → Auto Wallet Creation

```
┌─────────────────────────────────┐
│ Validation                       │
│ - Email format valid             │
│ - Password >= 8 chars            │
│ - Email not already registered   │
└─────────────┬───────────────────┘
              │
              ▼
┌─────────────────────────────────┐
│ Bcrypt Hash Password             │
│ (BCRYPT_ROUNDS = 10)             │
│ Takes ~100ms                     │
└─────────────┬───────────────────┘
              │
              ▼
┌─────────────────────────────────┐
│ DB Transaction:                  │
│ 1. INSERT user                   │
│ 2. INSERT wallet (balance=0)     │
│ 3. COMMIT                        │
└─────────────────────────────────┘
```

### Login → Get Tokens

```
┌─────────────────────────────────┐
│ 1. Find user by email            │
│ 2. Compare password vs hash      │
│    (bcryptjs.compare)            │
└─────────────┬───────────────────┘
              │
              ▼
┌─────────────────────────────────┐
│ Generate Tokens:                 │
│                                  │
│ Access Token (JWT):              │
│ ├─ Algorithm: HS256              │
│ ├─ Payload: {userId, email}      │
│ ├─ Secret: JWT_SECRET            │
│ ├─ Expiry: 1 hour                │
│ └─ Signed                        │
│                                  │
│ Refresh Token (Random):          │
│ ├─ crypto.randomBytes(32)        │
│ └─ Hashed for storage            │
└─────────────┬───────────────────┘
              │
              ▼
┌─────────────────────────────────┐
│ Hash & Store Refresh Token:      │
│ 1. Hash = SHA256(refresh_token)  │
│ 2. INSERT refresh_token          │
│    {user_id, token_hash,         │
│     expires_at=30days}           │
│ 3. COMMIT                        │
└─────────────────────────────────┘
```

### Token Refresh

```
POST /auth/refresh
{refreshToken}
       │
       ▼
┌─────────────────────────────────┐
│ Hash the token                   │
│ hash = SHA256(refreshToken)      │
└─────────────┬───────────────────┘
              │
              ▼
┌─────────────────────────────────┐
│ Query DB:                        │
│ SELECT * FROM refresh_tokens     │
│ WHERE token_hash = hash          │
└─────────────┬───────────────────┘
              │
              ├─ Token not found?
              │  └─ Return 401
              │
              ├─ Token revoked? (revoked_at is set)
              │  └─ Return 401
              │
              ├─ Token expired? (now > expires_at)
              │  └─ Return 401
              │
              └─ Valid? ✓
                 │
                 ▼
         ┌────────────────────────────┐
         │ Generate new access token  │
         │ (same as login)            │
         └────────────┬───────────────┘
                      │
                      ▼
         ┌────────────────────────────┐
         │ Response 200:              │
         │ {accessToken, expiresIn}   │
         └────────────────────────────┘
```

### Logout (Revoke Token)

```
POST /auth/logout
Authorization: Bearer <access_token>
{refreshToken}
       │
       ▼
┌─────────────────────────────────┐
│ 1. Verify access token          │
│    (JWT signature check)         │
│ 2. Extract userId from token    │
└─────────────┬───────────────────┘
              │
              ▼
┌─────────────────────────────────┐
│ Hash refresh token              │
└─────────────┬───────────────────┘
              │
              ▼
┌─────────────────────────────────┐
│ UPDATE refresh_tokens            │
│ SET revoked_at = now()           │
│ WHERE user_id = ? AND            │
│       token_hash = ?             │
└─────────────┬───────────────────┘
              │
              ▼
┌─────────────────────────────────┐
│ Next request with old token:     │
│ - Token signature is valid ✓     │
│ - But userId is revoked user... │
│                                  │
│ (For instant revocation, need    │
│  token blacklist in DB)          │
└─────────────────────────────────┘
```

---

## ⚙️ Job Queue & Background Processing

### Job Lifecycle

```
STATE: QUEUED
  │
  └─ nextRetryAt is NULL or <= now()
     │
     ▼
STATE: PROCESSING
  │
  ├─ Job handler executes
  │
  ├─ ✓ Success
  │  │
  │  └─ STATE: DONE
  │     (Increment attempts)
  │
  └─ ✗ Error
     │
     ├─ attempts < MAX_RETRIES?
     │  │
     │  ├─ YES: Schedule retry
     │  │  │
     │  │  └─ STATE: QUEUED
     │  │     nextRetryAt = now() + exponential_delay
     │  │     
     │  │     Exponential Backoff:
     │  │     - Attempt 1: Initial (fail)
     │  │     - Attempt 2: Retry after 1s × 2^1 = 2s
     │  │     - Attempt 3: Retry after 1s × 2^2 = 4s
     │  │     - Attempt 4: Fail permanently
     │  │
     │  └─ NO: Mark as permanently failed
     │     │
     │     └─ STATE: FAILED
     │        (Store error message)
     │
     └─ Worker retries on next cycle
```

### Job Processing Loop

```
Background Worker Loop (runs every 5 seconds):

1. Query: SELECT * FROM jobs 
   WHERE status = 'QUEUED' AND 
         (nextRetryAt IS NULL OR nextRetryAt <= now())
   LIMIT 10

2. For each job:
   ├─ UPDATE job SET status = 'PROCESSING'
   │
   ├─ Execute job handler:
   │  ├─ Get handler for job.type
   │  ├─ Call handler(job)
   │  └─ Wait for result
   │
   ├─ If success:
   │  └─ UPDATE job SET status = 'DONE'
   │
   └─ If error:
      ├─ Increment attempts
      ├─ If attempts < MAX_RETRIES:
      │  └─ UPDATE job SET 
      │     status = 'QUEUED',
      │     nextRetryAt = now() + delay
      └─ Else:
         └─ UPDATE job SET status = 'FAILED'

3. Sleep 5 seconds, repeat
```

### Job Types & Handlers

```
┌─────────────────────────────────────────┐
│ Job Type: credit_wallet                 │
├─────────────────────────────────────────┤
│ Payload:                                │
│ {transactionId, walletId, amount}       │
│                                         │
│ Handler Steps:                          │
│ 1. Lock wallet row                      │
│ 2. UPDATE wallet SET balance += amount  │
│ 3. UPDATE transaction SET status=SUCCESS│
│ 4. COMMIT                               │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ Job Type: transfer_funds                │
├─────────────────────────────────────────┤
│ Payload:                                │
│ {transactionId, fromWalletId,           │
│  toWalletId, amount}                    │
│                                         │
│ Handler Steps:                          │
│ 1. Lock both wallets (ordered)          │
│ 2. Check sender balance >= amount       │
│ 3. UPDATE sender balance -= amount      │
│ 4. UPDATE recipient balance += amount   │
│ 5. UPDATE transaction SET status=SUCCESS│
│ 6. COMMIT                               │
│                                         │
│ Error Scenarios:                        │
│ ├─ Insufficient balance → Retry         │
│ ├─ Wallet deleted → Fail                │
│ └─ Amount invalid → Fail                │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ Job Type: reverse_transaction           │
├─────────────────────────────────────────┤
│ Payload:                                │
│ {transactionId, walletId, amount}       │
│                                         │
│ Handler Steps:                          │
│ 1. Lock wallet                          │
│ 2. UPDATE wallet SET balance += amount  │
│ 3. UPDATE transaction SET status=REVERSED
│ 4. COMMIT                               │
└─────────────────────────────────────────┘
```

---

## 🛡️ Concurrency & Race Condition Handling

### Problem: Concurrent Transfers

```
User A: ₹1000
User B: ₹2000

Scenario without proper locking:

Time  Transfer 1         Transfer 2         Result
────────────────────────────────────────────────────
T1    Read A: ₹1000
T2                       Read A: ₹1000
T3    Write A: ₹500                        Race condition!
T4                       Write A: ₹-500    Negative balance!
```

### Solution: Database Transactions (SERIALIZABLE)

```
Our Implementation:

┌──────────────────────────────────────────┐
│ DB Transaction (SERIALIZABLE isolation)  │
├──────────────────────────────────────────┤
│ BEGIN TRANSACTION                        │
│                                          │
│ 1. SELECT * FROM wallets                 │
│    WHERE id IN (A, B)                    │
│    FOR UPDATE  ← Row-level lock          │
│                                          │
│ 2. CHECK balance_A >= amount             │
│    (inside transaction)                  │
│                                          │
│ 3. UPDATE wallet SET balance -= amount   │
│    WHERE id = A                          │
│                                          │
│ 4. UPDATE wallet SET balance += amount   │
│    WHERE id = B                          │
│                                          │
│ 5. COMMIT (atomic)                       │
│                                          │
│ If any step fails → ROLLBACK              │
└──────────────────────────────────────────┘

Result with locking:

Time  Transfer 1         Transfer 2
─────────────────────────────────────
T1    Lock A, B
T2                       Waiting for lock...
T3    Read A: ₹1000
T4    Check: OK ✓
T5    UPDATE A: ₹500
T6    UPDATE B: ₹2500
T7    COMMIT
T8    Release locks
T9                       Lock A, B acquired
T10                      Read A: ₹500
T11                      Check: OK ✓
T12                      UPDATE A: ₹-500... FAIL!
T13                      ROLLBACK (prevents negative)
T14                      Return error to user
```

---

## 📈 Scalability Considerations

### Current Bottlenecks

```
1. PostgreSQL Job Queue
   ├─ Throughput: ~100-500 jobs/sec on single DB
   ├─ Polling: Every 5 seconds (latency: 0-5s)
   └─ Solution: Use Redis Bull for high throughput

2. Single Background Worker
   ├─ Max concurrent jobs: Limited by Node.js
   └─ Solution: Run multiple worker instances

3. Database Connections
   ├─ Each request uses 1 connection
   ├─ Max connections: ~100 default
   └─ Solution: Connection pooling (pg-pool)

4. JWT Token Size
   ├─ Each request needs token validation
   ├─ No caching of validation
   └─ Solution: JWT caching layer (5-10s TTL)
```

### Scaling Strategies

```
┌─────────────────────────────────────────────┐
│ Phase 1: Single Server (Current)            │
├─────────────────────────────────────────────┤
│ - 1 API server (Express)                    │
│ - 1 Background worker process               │
│ - 1 PostgreSQL database                     │
│ - Throughput: ~100 requests/sec             │
└─────────────────────────────────────────────┘
         ↓ (As traffic grows)

┌─────────────────────────────────────────────┐
│ Phase 2: Horizontal Scaling                 │
├─────────────────────────────────────────────┤
│ - Multiple API server instances (3-5)       │
│ - Load balancer (Nginx, HAProxy)            │
│ - Single PostgreSQL (vertically scaled)     │
│ - Multiple worker instances (3-5)           │
│ - Redis for job queue (Bull)                │
│ - Throughput: ~500-1000 requests/sec        │
└─────────────────────────────────────────────┘
         ↓ (Further scaling)

┌─────────────────────────────────────────────┐
│ Phase 3: Database Replication               │
├─────────────────────────────────────────────┤
│ - Primary PostgreSQL (writes)               │
│ - Read replicas (reads)                     │
│ - Cache layer (Redis)                       │
│ - CDN for static content                    │
│ - Throughput: 1000+ requests/sec            │
└─────────────────────────────────────────────┘
```

---

## 🔄 Data Flow Diagrams

### Complete Request Flow

```
┌─────────────────────────────────────────────────────────────┐
│                      CLIENT REQUEST                         │
│              POST /wallets/transfer                         │
│         Authorization: Bearer <access_token>                │
│         {toWalletId, amount}                                │
└────────────┬────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────┐
│                   API SERVER                                │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ 1. CORS & Rate Limiting Middleware                   │   │
│  └──────────────┬───────────────────────────────────────┘   │
│                 │
│                 ▼
│  ┌──────────────────────────────────────────────────────┐   │
│  │ 2. Authentication Middleware                         │   │
│  │    - Extract JWT from header                         │   │
│  │    - Verify signature (no DB call)                   │   │
│  │    - Extract userId, email                          │   │
│  │    - Attach to req.user                             │   │
│  └──────────────┬───────────────────────────────────────┘   │
│                 │
│                 ▼
│  ┌──────────────────────────────────────────────────────┐   │
│  │ 3. Route Handler (/wallets/transfer)                │   │
│  │    - Validate input with Joi schema                 │   │
│  │    - Return errors if validation fails              │   │
│  └──────────────┬───────────────────────────────────────┘   │
│                 │
│                 ▼
│  ┌──────────────────────────────────────────────────────┐   │
│  │ 4. Wallet Service                                   │   │
│  │    - walletService.transferFunds()                  │   │
│  │    - Verify sender wallet exists                    │   │
│  │    - Verify recipient wallet exists                 │   │
│  │    - Check balance (soft check)                     │   │
│  │    - Create transaction in DB                       │   │
│  │    - Queue job                                      │   │
│  │    - Return transaction object                      │   │
│  └──────────────┬───────────────────────────────────────┘   │
│                 │
│                 ▼
│  ┌──────────────────────────────────────────────────────┐   │
│  │ 5. Response Handler                                 │   │
│  │    - Serialize response                             │   │
│  │    - Return 202 Accepted                            │   │
│  └──────────────┬───────────────────────────────────────┘   │
└────────────────┼────────────────────────────────────────────┘
                 │
                 ▼
     ┌───────────────────────────┐
     │  202 ACCEPTED RESPONSE     │
     │  {id, status: PENDING, ..} │
     └───────────────────────────┘


MEANWHILE IN BACKGROUND (Async):

         ┌──────────────────────────────────────┐
         │ Background Worker                    │
         │ (Separate Node process)              │
         │                                      │
         │ 1. Poll jobs table (every 5s)        │
         │    WHERE status='QUEUED' LIMIT 10    │
         │                                      │
         │ 2. Get first queued job              │
         │    type='transfer_funds'             │
         │                                      │
         │ 3. Mark as PROCESSING                │
         │                                      │
         │ 4. Call handlers.processJob()        │
         │                                      │
         │ 5. Execute job handler logic:        │
         │    ├─ Lock both wallets              │
         │    ├─ Check sender balance           │
         │    ├─ Debit sender                   │
         │    ├─ Credit recipient               │
         │    ├─ Update transaction SUCCESS     │
         │    └─ COMMIT (atomic)                │
         │                                      │
         │ 6. Mark job as DONE                  │
         │                                      │
         │ 7. Repeat                            │
         └──────────────────────────────────────┘


CLIENT POLLS FOR STATUS:

         ┌──────────────────────────────────┐
         │ GET /transactions/tx-id           │
         │ Authorization: Bearer <token>     │
         └────────────┬─────────────────────┘
                      │
                      ▼
         ┌──────────────────────────────────┐
         │ Query DB:                        │
         │ SELECT * FROM transactions       │
         │ WHERE id = ? AND                 │
         │       fromWalletId IN (...)      │
         │                                  │
         │ Return transaction with          │
         │ status = SUCCESS (if ready)      │
         └──────────────────────────────────┘
```

---

## 🔌 Component Communication

### Service Layer Dependencies

```
Routes
  │
  ├─ auth.js
  │  └─ authService
  │     ├─ hashPassword() [utils/hash]
  │     ├─ generateAccessToken() [utils/jwt]
  │     └─ generateRefreshToken() [utils/jwt]
  │
  ├─ wallets.js
  │  └─ walletService
  │     ├─ getWallet()
  │     ├─ creditWallet()
  │     │  └─ jobService.createJob()
  │     └─ transferFunds()
  │        └─ jobService.createJob()
  │
  ├─ transactions.js
  │  └─ transactionService
  │     ├─ getTransactions()
  │     ├─ getTransactionById()
  │     └─ updateTransactionStatus()
  │
  └─ users.js
     └─ Directly queries with Prisma


Background Worker
  │
  └─ worker.js
     ├─ jobService.getQueuedJobs()
     ├─ jobService.markJobProcessing()
     ├─ handlers.processJob()
     │  ├─ handleCreditWallet()
     │  ├─ handleTransferFunds()
     │  └─ handleReverseTransaction()
     ├─ jobService.markJobDone()
     └─ jobService.markJobFailed()
```

---

## 🔐 Security Layers

```
┌────────────────────────────────────────────────────┐
│ Layer 1: HTTPS/TLS                                │
│ All traffic encrypted in transit                  │
└────────────────────────────────────────────────────┘
         ↓
┌────────────────────────────────────────────────────┐
│ Layer 2: CORS & Rate Limiting                     │
│ - Only allowed origins                           │
│ - Max 100 requests per 15 seconds                 │
└────────────────────────────────────────────────────┘
         ↓
┌────────────────────────────────────────────────────┐
│ Layer 3: Input Validation (Joi)                   │
│ - Email format, password strength                 │
│ - Amount > 0, recipient exists                    │
└────────────────────────────────────────────────────┘
         ↓
┌────────────────────────────────────────────────────┐
│ Layer 4: Authentication (JWT)                     │
│ - Verify token signature (HS256)                  │
│ - Extract userId from payload                    │
└────────────────────────────────────────────────────┘
         ↓
┌────────────────────────────────────────────────────┐
│ Layer 5: Authorization (Business Logic)           │
│ - User can only access own wallet/transactions    │
│ - Cannot transfer to self                         │
│ - Cannot view other users' data                   │
└────────────────────────────────────────────────────┘
         ↓
┌────────────────────────────────────────────────────┐
│ Layer 6: Database Security                        │
│ - Parameterized queries (Prisma)                  │
│ - Row-level locks for concurrent operations      │
│ - Check constraints (balance >= 0)                │
│ - Unique constraints (email, reference_id)       │
└────────────────────────────────────────────────────┘
```

---

## 📊 Monitoring & Observability

### Key Metrics to Track

```
Application Metrics:
├─ Request latency (p50, p95, p99)
├─ Request throughput (req/sec)
├─ Error rate (5xx, 4xx)
├─ JWT validation time
├─ Password hashing time (bcrypt)
└─ Authentication success rate

Database Metrics:
├─ Connection pool utilization
├─ Query latency
├─ Lock contention
├─ Slow queries (> 100ms)
├─ Transaction rollback rate
└─ Database size growth

Job Queue Metrics:
├─ Queue size (pending jobs)
├─ Processing rate (jobs/sec)
├─ Job success rate
├─ Average job duration
├─ Retry rate
└─ Failed job count

Business Metrics:
├─ Registration rate
├─ Login success rate
├─ Transaction completion rate
├─ Average transfer amount
├─ Daily active users
└─ Wallet balance distribution
```

### Logging Strategy

```
Structured Logging (JSON):

{
  "timestamp": "2024-01-15T10:30:00.123Z",
  "level": "INFO",
  "service": "wallet-api",
  "message": "Transfer initiated",
  "userId": "550e...",
  "transactionId": "tx-...",
  "fromWalletId": "w1-...",
  "toWalletId": "w2-...",
  "amount": 5000,
  "duration": 23
}

Log Levels:
├─ DEBUG: Detailed debugging info
├─ INFO: Important business events (login, transfer initiated)
├─ WARN: Recoverable issues (retry scheduled)
├─ ERROR: Failed operations (invalid payment)
└─ FATAL: System crashes (DB connection lost)

Storage:
├─ Console: Development
├─ File: Production (auto-rotate)
├─ Log aggregation: ELK, Splunk, DataDog
└─ Error tracking: Sentry
```

---

## 🔄 State Management

### Transaction State Machine

```
         ┌─ PENDING ─┐
         │           │
    CREATE           (Job Processing)
    TRANS.          │
         │          ▼
         │      PROCESSING (in job handler)
         │          │
         │      SUCCESS or FAIL
         │          │
         └─────────┬┘
         │         │
         ▼         ▼
      SUCCESS    FAILED
         │         │
      (FINAL)   (FINAL)
         
         └──────┬────────┘
                │
         Can be: REVERSED
         (refund)
                │
                ▼
            REVERSED (FINAL)
```

### Job State Machine

```
    QUEUED
      │
      ├─ (next_retry_at passed)
      │
      ▼
  PROCESSING
      │
   SUCCESS?
      │
   ┌──┴──┐
   │     │
  YES    NO
   │     │
   ▼     ▼
  DONE  Retry?
        │
      ┌─┴─┐
      │   │
     YES  NO
      │   │
      ▼   ▼
    QUEUED FAILED
      │
    (exponential backoff,
      increment attempts)
```

---

## 🎯 Design Principles

### 1. **Asynchrony First**
- Critical operations (balance updates) are async
- Client gets response immediately (202)
- Prevents blocking, improves UX

### 2. **Atomicity**
- All-or-nothing updates via DB transactions
- No partial balance updates
- Concurrent operations safe

### 3. **Idempotency**
- Unique reference_id prevents duplicates
- Retry-safe operations
- Can safely retry requests

### 4. **Statelessness**
- JWT access tokens need no DB lookup
- Scales horizontally
- No session affinity needed

### 5. **Separation of Concerns**
- Routes: HTTP handling
- Services: Business logic
- Handlers: Specific operations
- Utils: Shared functions

### 6. **Fail-Safe Defaults**
- Balance can never go negative (DB constraint)
- Failed jobs retry automatically
- No data loss on crashes (durable queue)

---

## 🚀 Deployment Architecture

### Development

```
Local Machine
├─ Node.js (npm run dev)
├─ PostgreSQL (local or Docker)
└─ Single process for both API + worker
```

### Production

```
┌────────────────────────────────────────────┐
│              AWS / Cloud Provider          │
├────────────────────────────────────────────┤
│                                            │
│  ┌──────────────────────────────────────┐  │
│  │  Load Balancer (ALB / Nginx)         │  │
│  │  - HTTPS/TLS termination             │  │
│  │  - Route to API instances            │  │
│  └────────────┬─────────────────────────┘  │
│               │                             │
│    ┌──────────┼──────────┐                 │
│    │          │          │                 │
│    ▼          ▼          ▼                 │
│  ┌────┐    ┌────┐    ┌────┐               │
│  │API1│    │API2│    │API3│  (ECS / K8s)  │
│  └────┘    └────┘    └────┘               │
│    │          │          │                 │
│    └──────────┼──────────┘                 │
│               │                            │
│               ▼                            │
│  ┌────────────────────────────────────┐   │
│  │  RDS PostgreSQL                    │   │
│  │  - Primary (write)                 │   │
│  │  - Read replicas (read-heavy)      │   │
│  │  - Automated backups               │   │
│  │  - Multi-AZ for HA                 │   │
│  └────────────┬─────────────────────┘   │
│               │                          │
│               ▼                          │
│  ┌────────────────────────────────────┐  │
│  │  ElastiCache (Redis)               │  │
│  │  - Job queue (Bull)                │  │
│  │  - Session cache                   │  │
│  │  - Rate limit counters             │  │
│  └────────────────────────────────────┘  │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │  Background Workers                │  │
│  │  - Separate EC2 / ECS instances    │  │
│  │  - Auto-scaling based on queue     │  │
│  │  - Health checks                   │  │
│  └────────────────────────────────────┘  │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │  Monitoring & Logging              │  │
│  │  - CloudWatch / DataDog            │  │
│  │  - ELK stack for logs              │  │
│  │  - Sentry for errors               │  │
│  │  - PagerDuty for alerts            │  │
│  └────────────────────────────────────┘  │
│                                          │
└────────────────────────────────────────────┘
```

---

## ✅ Conclusion

This system design prioritizes:

1. **Reliability**: Durable job queue, atomic operations, retry logic
2. **Performance**: Async processing, stateless JWT, efficient database queries
3. **Scalability**: Horizontal scaling ready, async-first architecture
4. **Security**: Multiple layers, encrypted transport, input validation
5. **Maintainability**: Clear separation of concerns, well-documented
6. **Observability**: Structured logging, metrics, error tracking

See `SYSTEM_GUIDE.md` for specific modeling decisions and `README.md` for deployment instructions.
