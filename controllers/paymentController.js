const { Paynow } = require('paynow');

exports.initiatePayment = async (req, res) => {
  const { email, orderItems, tax, shippingFee, reference } = req.body;

  if (!orderItems || !Array.isArray(orderItems) || orderItems.length === 0) {
    return res.status(400).json({ success: false, error: 'Cart is empty' });
  }

  const returnUrl = `http://localhost:5173/order-success/${reference}`;
  const resultUrl = 'http://localhost:3000/payment/payment-result';

  // ✅ Create new Paynow instance with dynamic URLs
  const paynow = new Paynow('21272', '08830426-c6b4-40ff-a7cf-8bda806085cc', resultUrl, returnUrl);

  const payment = paynow.createPayment(reference, email);

  orderItems.forEach((item) => {
    payment.add(item.productName, item.subtotal);
  });

  if (tax > 0) payment.add('Tax', tax);
  if (shippingFee > 0) payment.add('Shipping Fee', shippingFee);

  try {
    const response = await paynow.send(payment);

    if (response.success) {
      res.status(200).json({
        success: true,
        redirectUrl: response.redirectUrl,
      });
    } else {
      res.status(400).json({
        success: false,
        error: response.error || 'Payment failed to initialize',
      });
    }
  } catch (error) {
    console.error('Paynow error:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// exports.initiatePayment = async (req, res) => {
//   const { email, amount, reference } = req.body;

//   const payment = paynow.createPayment(reference, email);

//   payment.add('Cart Items', amount);

//   try {
//     const response = await paynow.send(payment);

//     console.log(response);

//     if (response.success) {
//       res.status(200).json({
//         success: true,
//         redirectUrl: response.redirectUrl,
//       });
//     } else {
//       res.status(400).json({
//         success: false,
//         error: response.error || 'Payment failed to initialize',
//       });
//     }
//   } catch (error) {
//     console.error('Paynow error:', error);
//     res.status(500).json({ success: false, error: 'Server error' });
//   }
// };

// Add this handler for the result URL callback
exports.handlePaymentResult = async (req, res) => {
  try {
    // Paynow will POST the payment result to this endpoint
    const pollUrl = req.body.pollurl;

    if (pollUrl) {
      // Poll the payment status
      const status = await paynow.pollTransaction(pollUrl);

      console.log('Payment status:', status);

      // Handle the payment status
      if (status.paid) {
        // Payment was successful
        console.log('Payment successful for reference:', status.reference);
        // Update your database, send confirmation emails, etc.
      } else {
        console.log('Payment failed or pending for reference:', status.reference);
      }
    }

    // Always respond with 200 to acknowledge receipt
    res.status(200).send('OK');
  } catch (error) {
    console.error('Error handling payment result:', error);
    res.status(200).send('OK'); // Still acknowledge to prevent retries
  }
};
