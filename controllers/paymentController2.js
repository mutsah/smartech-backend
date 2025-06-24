require('dotenv').config({ path: `${process.cwd()}/.env` });
const paypal = require('@paypal/checkout-server-sdk');
const { paypalCreateOrderSchema } = require('../middlewares/validator');

const environment = () => {
  let clientId = process.env.PAYPAL_CLIENT_ID;
  let clientSecret = process.env.PAYPAL_CLIENT_SECRET;

  // Add validation for environment variables
  if (!clientId || !clientSecret) {
    throw new Error('PayPal credentials are missing from environment variables');
  }

  return new paypal.core.SandboxEnvironment(clientId, clientSecret);
};

const client = () => {
  return new paypal.core.PayPalHttpClient(environment());
};

// Helper function to format amounts to 2 decimal places
const formatAmount = (amount) => {
  const num = parseFloat(amount);
  if (isNaN(num)) {
    throw new Error(`Invalid amount: ${amount}`);
  }
  return num.toFixed(2);
};

// Helper function to validate amount totals
const validateAmounts = (subTotal, shippingFee, tax, totalAmount) => {
  const calculatedTotal = parseFloat(subTotal) + parseFloat(shippingFee) + parseFloat(tax);
  const providedTotal = parseFloat(totalAmount);

  // Allow small rounding differences (0.01)
  if (Math.abs(calculatedTotal - providedTotal) > 0.01) {
    throw new Error(
      `Amount mismatch: calculated ${calculatedTotal.toFixed(2)} vs provided ${providedTotal.toFixed(2)}`,
    );
  }
};

exports.createOrder = async (req, res) => {
  try {
    console.log('=== PayPal Create Order Request ===');
    console.log('Request body:', JSON.stringify(req.body, null, 2));

    const { subTotal, totalAmount, shippingFee, orderItems, tax } = req.body;

    // Basic validation
    if (!orderItems || !Array.isArray(orderItems) || orderItems.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Order items are required and must be a non-empty array',
      });
    }

    // Validate required fields
    if (
      subTotal === undefined ||
      totalAmount === undefined ||
      shippingFee === undefined ||
      tax === undefined
    ) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: subTotal, totalAmount, shippingFee, tax',
      });
    }

    // Validate input using your schema if it exists
    if (paypalCreateOrderSchema) {
      const { error, value } = paypalCreateOrderSchema.validate({
        subTotal,
        totalAmount,
        shippingFee,
        orderItems,
        tax,
      });

      if (error) {
        console.error('Validation error:', error.details[0].message);
        return res.status(400).json({
          success: false,
          error: error.details[0].message,
        });
      }
    }

    // Convert and validate numeric values
    const numericSubTotal = parseFloat(subTotal);
    const numericShippingFee = parseFloat(shippingFee);
    const numericTax = parseFloat(tax);
    const numericTotalAmount = parseFloat(totalAmount);

    if (
      isNaN(numericSubTotal) ||
      isNaN(numericShippingFee) ||
      isNaN(numericTax) ||
      isNaN(numericTotalAmount)
    ) {
      return res.status(400).json({
        success: false,
        error: 'All amount fields must be valid numbers',
      });
    }

    // Validate amounts match
    validateAmounts(numericSubTotal, numericShippingFee, numericTax, numericTotalAmount);

    // Validate minimum amounts
    if (numericTotalAmount < 0.01) {
      return res.status(400).json({
        success: false,
        error: 'Total amount must be at least $0.01',
      });
    }

    // Validate and process order items
    const processedOrderItems = [];
    let calculatedItemTotal = 0;

    for (const item of orderItems) {
      // Validate required item fields
      if (!item.productId || !item.quantity || !item.price || !item.productName) {
        return res.status(400).json({
          success: false,
          error: 'Each order item must have productId, quantity, price, and productName',
        });
      }

      const itemPrice = parseFloat(item.price);
      const itemQuantity = parseInt(item.quantity);

      if (isNaN(itemPrice) || itemPrice <= 0) {
        return res.status(400).json({
          success: false,
          error: `Invalid price for item ${item.productId}: ${item.price}`,
        });
      }

      if (isNaN(itemQuantity) || itemQuantity <= 0) {
        return res.status(400).json({
          success: false,
          error: `Invalid quantity for item ${item.productId}: ${item.quantity}`,
        });
      }

      // Validate product name length (PayPal limit)
      const productName = item.productName.substring(0, 127); // PayPal limit is 127 chars

      calculatedItemTotal += itemPrice * itemQuantity;

      processedOrderItems.push({
        name: productName,
        unit_amount: {
          currency_code: 'USD',
          value: formatAmount(itemPrice),
        },
        quantity: itemQuantity.toString(),
        sku: item.productId.toString(),
        category: 'PHYSICAL_GOODS',
      });
    }

    // Validate item total matches subTotal
    if (Math.abs(calculatedItemTotal - numericSubTotal) > 0.01) {
      return res.status(400).json({
        success: false,
        error: `Item total mismatch: calculated ${calculatedItemTotal.toFixed(2)} vs provided ${numericSubTotal.toFixed(2)}`,
      });
    }

    const request = new paypal.orders.OrdersCreateRequest();
    request.prefer('return=representation');

    const requestBody = {
      intent: 'CAPTURE',
      purchase_units: [
        {
          amount: {
            currency_code: 'USD',
            value: formatAmount(numericTotalAmount),
            breakdown: {
              item_total: {
                currency_code: 'USD',
                value: formatAmount(numericSubTotal),
              },
              shipping: {
                currency_code: 'USD',
                value: formatAmount(numericShippingFee),
              },
              tax_total: {
                currency_code: 'USD',
                value: formatAmount(numericTax),
              },
            },
          },
          items: processedOrderItems,
        },
      ],
      application_context: {
        return_url: `${process.env.BASE_URL || 'http://localhost:3000'}/payment/success`,
        cancel_url: `${process.env.BASE_URL || 'http://localhost:3000'}/payment/cancel`,
        brand_name: process.env.BRAND_NAME || 'Your Store',
        landing_page: 'BILLING',
        user_action: 'PAY_NOW',
      },
    };

    request.requestBody(requestBody);

    console.log('=== PayPal Request Body ===');
    console.log(JSON.stringify(requestBody, null, 2));

    const order = await client().execute(request);

    console.log('=== PayPal Order Created Successfully ===');
    console.log('Order ID:', order.result.id);
    console.log('Status:', order.result.status);

    res.status(200).json({
      success: true,
      message: 'Order created successfully',
      orderID: order.result.id,
      approvalUrl: order.result.links.find((link) => link.rel === 'approve')?.href,
    });
  } catch (err) {
    console.error('=== PayPal Create Order Error ===');
    console.error('Error type:', err.constructor.name);
    console.error('Error message:', err.message);

    if (err.statusCode) {
      console.error('PayPal API Error - Status Code:', err.statusCode);
      console.error('PayPal API Error - Details:', JSON.stringify(err.details || {}, null, 2));
    }

    if (err.stack) {
      console.error('Stack trace:', err.stack);
    }

    // Handle specific PayPal errors
    if (err.statusCode) {
      return res.status(err.statusCode).json({
        success: false,
        error: err.message,
        details: err.details || [],
      });
    }

    // Handle validation errors
    if (err.message.includes('Amount mismatch') || err.message.includes('Invalid')) {
      return res.status(400).json({
        success: false,
        error: err.message,
      });
    }

    res.status(500).json({
      success: false,
      error: err.message || 'Internal server error',
    });
  }
};

exports.captureOrder = async (req, res) => {
  try {
    const { orderID } = req.params;

    console.log('=== PayPal Capture Order Request ===');
    console.log('Order ID:', orderID);

    if (!orderID) {
      return res.status(400).json({
        success: false,
        error: 'Order ID is required',
      });
    }

    const request = new paypal.orders.OrdersCaptureRequest(orderID);
    request.requestBody({});

    const capture = await client().execute(request);

    console.log('=== PayPal Order Captured Successfully ===');
    console.log('Capture ID:', capture.result.id);
    console.log('Status:', capture.result.status);

    res.status(200).json({
      success: true,
      message: 'Payment captured successfully',
      data: capture.result,
      transactionId: capture.result.purchase_units[0].payments.captures[0].id,
    });
  } catch (err) {
    console.error('=== PayPal Capture Order Error ===');
    console.error('Error type:', err.constructor.name);
    console.error('Error message:', err.message);

    if (err.statusCode) {
      console.error('PayPal API Error - Status Code:', err.statusCode);
      console.error('PayPal API Error - Details:', JSON.stringify(err.details || {}, null, 2));
    }

    // Handle specific PayPal errors
    if (err.statusCode) {
      return res.status(err.statusCode).json({
        success: false,
        error: err.message,
        details: err.details || [],
      });
    }

    res.status(500).json({
      success: false,
      error: err.message || 'Internal server error',
    });
  }
};
