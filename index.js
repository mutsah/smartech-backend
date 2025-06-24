require('dotenv').config({ path: `${process.cwd()}/.env` });

const express = require('express');
const cors = require('cors');

const app = express();
app.use(
  cors({
    origin: ['http://localhost:3000', 'http://localhost:5173'],
    methods: ['GET', 'POST', 'OPTIONS', 'DELETE', 'PUT'],
    allowedHeaders: ['Content-Type'],
  }),
);

const path = require('path');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');

const authRouter = require('./routes/authRoute');
const productRouter = require('./routes/productRoute');
const orderRouter = require('./routes/orderRoute');
const paymentRouter = require('./routes/paymentRoute');

// app.use("/uploads", express.static("uploads"));
app.use(helmet());
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  '/uploads',
  express.static('uploads', {
    setHeaders: (res) => {
      res.setHeader('Access-Control-Allow-Origin', 'http://localhost:5173');
    },
  }),
);

app.use('/auth', authRouter);
app.use('/product', productRouter);
app.use('/order', orderRouter);
app.use('/payment', paymentRouter);

// testing
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Hello from the server. API running!!',
  });
});

app.get('/test-cors', (req, res) => {
  console.log(req.headers.origin); // Log incoming origin
  res.json({ message: 'CORS test' });
});

app.get('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'route not found',
  });
});

PORT = process.env.APP_PORT || 4000;

app.listen(PORT, () => {
  console.log('Server up and running...', PORT);
});
