// const express = require('express');
// const mongoose = require('mongoose');
// const cors = require('cors');
// const dotenv = require('dotenv');
// const contactRoutes = require('./routes/contacts');
// const authRoutes    = require('./routes/auth');

// dotenv.config();

// const app = express();

// // ── CORS ──────────────────────────────────────────────────────────────────────
// const allowedOrigins = process.env.FRONTEND_URL
//   ? [process.env.FRONTEND_URL, 'http://localhost:5173']
//   : ['http://localhost:5173'];

// app.use(
//   cors({
//     origin: (origin, callback) => {
//       if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
//         callback(null, true);
//       } else {
//         callback(new Error('Not allowed by CORS'));
//       }
//     },
//     methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
//     allowedHeaders: ['Content-Type'],
//   })
// );

// // ── Body parsers ───────────────────────────────────────────────────────────────
// app.use(express.json({ limit: '10kb' }));
// app.use(express.urlencoded({ extended: true }));

// // ── Routes ─────────────────────────────────────────────────────────────────────
// app.use('/api/auth',     authRoutes);
// app.use('/api/contacts', contactRoutes);

// app.get('/api/health', (req, res) => {
//   res.json({
//     status: 'OK',
//     message: 'ContactHub API is running',
//     timestamp: new Date().toISOString(),
//   });
// });

// // ── 404 handler ────────────────────────────────────────────────────────────────
// app.use((req, res) => {
//   res.status(404).json({ message: 'Route not found' });
// });

// // ── Global error handler ───────────────────────────────────────────────────────
// app.use((err, req, res, next) => {
//   console.error('Unhandled error:', err.message);
//   res.status(500).json({ message: 'Internal server error', error: err.message });
// });

// // ── Database + Server ──────────────────────────────────────────────────────────
// const MONGO_URI = process.env.MONGODB_URI;
// if (!MONGO_URI) {
//   console.error('❌  MONGODB_URI is not defined. Create a .env file (see .env.example).');
//   process.exit(1);
// }

// const PORT = process.env.PORT || 5000;

// mongoose
//   .connect(MONGO_URI)
//   .then(() => {
//     console.log('✅  Connected to MongoDB');
//     app.listen(PORT, () =>
//       console.log(`🚀  Server running on http://localhost:${PORT}`)
//     );
//   })
//   .catch((err) => {
//     console.error('❌  MongoDB connection failed:', err.message);
//     process.exit(1);
//   });

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const contactRoutes = require('./routes/contacts');
const authRoutes = require('./routes/auth');

dotenv.config();

const app = express();

// ===== ✅ FIXED CORS =====
const allowedOrigins = [
  process.env.FRONTEND_URL,
  "http://localhost:5173"
];

app.use(cors({
  origin: function (origin, callback) {
    // allow requests with no origin (postman, mobile apps)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    } else {
      return callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
}));

// Handle CORS preflight for all routes
app.options('*', cors());

// ===== Body parsers =====
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));

// ===== Routes =====
app.use('/api/auth', authRoutes);
app.use('/api/contacts', contactRoutes);

app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'ContactHub API is running',
    timestamp: new Date().toISOString(),
  });
});

// ===== 404 =====
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// ===== Global Error =====
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message);
  res.status(500).json({
    message: 'Internal server error',
    error: err.message
  });
});

// ===== DB + Server =====
const MONGO_URI = process.env.MONGODB_URI;

if (!MONGO_URI) {
  console.error('❌ MONGODB_URI is not defined');
  process.exit(1);
}

const PORT = process.env.PORT || 5000;

mongoose.connect(MONGO_URI)
  .then(() => {
    console.log('✅ Connected to MongoDB');
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('❌ MongoDB connection failed:', err.message);
    process.exit(1);
  });