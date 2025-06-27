exports.saveOrder = async (req, res) => {
  const client = await database.pool.connect();

  try {
    const { userId, totalAmount, shippingFee, orderItems, shippingAddress } = req.body;

    const { error, value } = saveOrderSchema.validate({
      userId,
      totalAmount,
      shippingFee,
      orderItems,
      shippingAddress,
    });

    if (error) {
      return res.status(400).json({ success: false, error: error.details[0].message });
    }

    const userExists = await database.pool.query({
      text: 'SELECT EXISTS (SELECT * FROM users WHERE id = $1)',
      values: [userId],
    });

    if (!userExists.rows[0].exists) {
      return res.status(409).json({ success: false, error: 'User not found' });
    }

    await client.query('BEGIN');

    // 1. Check stock availability for all products
    const stockCheckPromises = orderItems.map((item) =>
      client.query({
        text: 'SELECT id, title, stock FROM products WHERE id = $1',
        values: [item.productId],
      }),
    );

    const stockResults = await Promise.all(stockCheckPromises);
    const insufficientStock = [];

    for (let i = 0; i < stockResults.length; i++) {
      const stockResult = stockResults[i];
      const orderItem = orderItems[i];

      if (stockResult.rows.length === 0) {
        insufficientStock.push({
          productId: orderItem.productId,
          productName: orderItem.productName,
          error: 'Product not found',
        });
      } else {
        const product = stockResult.rows[0];
        const availableStock = parseInt(product.stock) || 0; // Ensure it's a number
        const requestedQuantity = parseInt(orderItem.quantity) || 0; // Ensure it's a number

        if (availableStock < requestedQuantity) {
          insufficientStock.push({
            productId: orderItem.productId,
            productName: product.title,
            availableStock,
            requestedQuantity,
            error: `Insufficient stock. Available: ${availableStock}, Requested: ${requestedQuantity}`,
          });
        }
      }
    }

    // If any product has insufficient stock, rollback and return error
    if (insufficientStock.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        error: 'Insufficient stock for some products',
        insufficientStock,
      });
    }

    // Create the order
    const saveOrder = await client.query({
      text: 'INSERT INTO orders (user_id, total_amount, shipping_fee, shipping_address) VALUES ($1, $2, $3, $4) RETURNING *',
      values: [userId, totalAmount, shippingFee, shippingAddress],
    });

    const orderId = saveOrder.rows[0].id;

    // Process each order item
    for (const item of orderItems) {
      // Ensure quantities are integers
      const quantity = parseInt(item.quantity) || 0;

      // Insert order item
      await client.query({
        text: 'INSERT INTO order_items (order_id, product_id, product_name, quantity, price, subtotal) VALUES ($1, $2, $3, $4, $5, $6)',
        values: [orderId, item.productId, item.productName, quantity, item.price, item.subtotal],
      });

      // 2. Update stock by subtracting the ordered quantity with explicit casting
      await client.query({
        text: 'UPDATE products SET stock = CAST(stock AS INTEGER) - $1 WHERE id = $2',
        values: [quantity, item.productId],
      });

      // 3. Update sales by adding the ordered quantity with explicit casting
      await client.query({
        text: 'UPDATE products SET sales = COALESCE(CAST(sales AS INTEGER), 0) + $1 WHERE id = $2',
        values: [quantity, item.productId],
      });
    }

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      message: 'Order saved successfully with inventory updated',
      order: saveOrder.rows[0],
    });
  } catch (error) {
    await client.query('ROLLBACK');

    console.error('Order creation failed:', error);

    res.status(500).json({
      success: false,
      error: 'Failed to create order. Transaction rolled back.',
      details: error.message,
    });
  } finally {
    client.release();
  }
};
