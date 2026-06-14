const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const sequelize = require('./config/db');
require('./models');
const routes = require('./routes/routes.index');

const app = express();
const PORT = process.env.PORT || 3000;

// ========== MIDDLEWARE ==========
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3001',
  credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ========== HEALTH CHECK ==========
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'Server is running' });
});

// ========== API ROUTES ==========
app.use('/api', routes);

// ========== ERROR HANDLER ==========
app.use((err, req, res, next) => {
  console.error('Error:', err);

  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
    error: process.env.NODE_ENV === 'development' ? err : undefined,
  });
});

// ========== 404 HANDLER ==========
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
  });
});

// ========== DATABASE & SERVER INITIALIZATION ==========
async function initializeApp() {
  try {
    // Test database connection
    await sequelize.authenticate();
    console.log('✓ Database connection established');

    require('./models');
    // Sync models with database
    await sequelize.sync({
      alter: process.env.NODE_ENV === 'development',
      force: false,
    });
    console.log('✓ Database models synced');

    // Start server
    app.listen(PORT, () => {
      console.log(`✓ Server running on port ${PORT}`);
      console.log(`✓ Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error) {
    console.error('✗ Failed to initialize app:', error);
    process.exit(1);
  }
}

initializeApp();

module.exports = app;