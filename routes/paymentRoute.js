const router = require('express').Router();
const paymentController = require('../controllers/paymentController');

router.post('/create-order', paymentController.initiatePayment);
router.post('/payment-result', paymentController.handlePaymentResult);
// router.post('/capture-order/:orderID', paymentController.captureOrder);

module.exports = router;
