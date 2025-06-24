const router = require('express').Router();
const paymentController = require('../controllers/paymentController');

router.post('/create-order', paymentController.createOrder);
router.post('/capture-order/:orderID', paymentController.captureOrder);

module.exports = router;
