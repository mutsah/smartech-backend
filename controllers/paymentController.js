require('dotenv').config();
const paypal = require('@paypal/checkout-server-sdk');

const environment = () => {
  let clientId = process.env.PAYPAL_CLIENT_ID;
  let clientSecret = process.env.PAYPAL_CLIENT_SECRET;

  return new paypal.core.SandboxEnvironment(clientId, clientSecret);
};

const client = () => {
  return new paypal.core.PayPalHttpClient(environment());
};

exports.createOrder = async (req, res) => {
  const { subTotal, totalAmount, shippingFee, orderItems, tax } = req.body;

  const request = new paypal.orders.OrdersCreateRequest();
  request.prefer('return=representation');
  request.requestBody({
    intent: 'CAPTURE',
    purchase_units: [
      {
        amount: {
          currency_code: 'USD',
          value: totalAmount,
          breakdown: {
            item_total: {
              currency_code: 'USD',
              value: subTotal,
            },
            shipping: {
              currency_code: 'USD',
              value: shippingFee,
            },
            tax_total: {
              currency_code: 'USD',
              value: tax,
            },
          },
        },
        items: orderItems.map((item) => ({
          name: item.productName,
          unit_amount: {
            currency_code: 'USD',
            value: item.price,
          },
          quantity: item.quantity,
          sku: item.productId,
        })),
      },
    ],
  });

  try {
    const order = await client().execute(request);
    res
      .status(200)
      .json({ success: true, message: 'Order captured successfully', orderID: order.result.id });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.captureOrder = async (req, res) => {
  const { orderID } = req.params;
  const request = new paypal.orders.OrdersCaptureRequest(orderID);
  request.requestBody({});

  try {
    const capture = await client().execute(request);
    res.status(200).json({ success: true, message: 'Payment success', data: capture });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
