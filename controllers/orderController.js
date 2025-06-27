const database = require('../config/database');
const { saveOrderSchema } = require('../middlewares/validator');

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
        const availableStock = product.stock;
        const requestedQuantity = orderItem.quantity;

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
      // Insert order item
      await client.query({
        text: 'INSERT INTO order_items (order_id, product_id, product_name, quantity, price, subtotal) VALUES ($1, $2, $3, $4, $5, $6)',
        values: [
          orderId,
          item.productId,
          item.productName,
          item.quantity,
          item.price,
          item.subtotal,
        ],
      });

      // 2. Update stock by subtracting the ordered quantity
      await client.query({
        text: 'UPDATE products SET stock = stock - $1 WHERE id = $2',
        values: [item.quantity, item.productId],
      });

      // 3. Update sales by adding the ordered quantity
      await client.query({
        text: 'UPDATE products SET sales = sales + $1 WHERE id = $2',
        values: [item.quantity, item.productId],
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

exports.getAllOrders = async (req, res) => {
  try {
    const query =
      'SELECT o.id as order_id, o.user_id, u.name as user_name, o.total_amount, o.shipping_fee, o.shipping_address,o.order_status, o.created_at as order_created_at, oi.id as item_id, oi.product_id, oi.product_name, oi.quantity, oi.price, oi.subtotal FROM orders o LEFT JOIN order_items oi ON o.id = oi.order_id LEFT JOIN users u ON o.user_id = u.id ORDER BY o.created_at DESC, oi.id ASC';

    const result = await database.pool.query(query);

    const ordersMap = new Map();

    result.rows.forEach((row) => {
      const orderId = row.order_id;

      if (!ordersMap.has(orderId)) {
        ordersMap.set(orderId, {
          id: row.order_id,
          userId: row.user_id,
          userName: row.user_name,
          totalAmount: row.total_amount,
          shippingFee: row.shipping_fee,
          shippingAddress: row.shipping_address,
          orderStatus: row.order_status,
          createdAt: row.order_created_at,
          orderItems: [],
        });
      }

      if (row.item_id) {
        ordersMap.get(orderId).orderItems.push({
          id: row.item_id,
          productId: row.product_id,
          productName: row.product_name,
          quantity: row.quantity,
          price: row.price,
          subtotal: row.subtotal,
        });
      }
    });

    const orders = Array.from(ordersMap.values());

    res.status(200).json({
      success: true,
      message: 'Orders retrieved successfully',
      count: orders.length,
      orders: orders,
    });
  } catch (error) {
    console.error('Failed to retrieve orders:', error);

    res.status(500).json({
      success: false,
      error: 'Failed to retrieve orders',
      details: error.message,
    });
  }
};

exports.getOrdersByUserId = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId || isNaN(userId)) {
      return res.status(400).json({
        success: false,
        error: 'Valid user ID is required',
      });
    }

    const userExists = await database.pool.query({
      text: 'SELECT EXISTS (SELECT * FROM users WHERE id = $1)',
      values: [userId],
    });

    if (!userExists.rows[0].exists) {
      return res.status(409).json({ success: false, error: 'User not found' });
    }

    const query =
      'SELECT o.id as order_id, o.user_id, o.total_amount, o.shipping_fee, o.shipping_address, o.created_at as order_created_at, oi.id as item_id, oi.product_id, oi.product_name, oi.quantity, oi.price, oi.subtotal FROM orders o LEFT JOIN order_items oi ON o.id = oi.order_id WHERE o.user_id = $1 ORDER BY o.created_at DESC, oi.id ASC';

    const result = await database.pool.query({
      text: query,
      values: [userId],
    });

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No orders found for this user',
        orders: [],
      });
    }

    const ordersMap = new Map();

    result.rows.forEach((row) => {
      const orderId = row.order_id;

      if (!ordersMap.has(orderId)) {
        ordersMap.set(orderId, {
          id: row.order_id,
          userId: row.user_id,
          totalAmount: row.total_amount,
          shippingFee: row.shipping_fee,
          shippingAddress: row.shipping_address,
          createdAt: row.order_created_at,
          orderItems: [],
        });
      }

      if (row.item_id) {
        ordersMap.get(orderId).orderItems.push({
          id: row.item_id,
          productId: row.product_id,
          productName: row.product_name,
          quantity: row.quantity,
          price: row.price,
          subtotal: row.subtotal,
        });
      }
    });

    const orders = Array.from(ordersMap.values());

    res.status(200).json({
      success: true,
      message: `Orders retrieved successfully for user ${userId}`,
      userId: parseInt(userId),
      count: orders.length,
      orders: orders,
    });
  } catch (error) {
    console.error('Failed to retrieve user orders:', error);

    res.status(500).json({
      success: false,
      error: 'Failed to retrieve user orders',
      details: error.message,
    });
  }
};

exports.updateOrder = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || isNaN(id)) {
      return res.status(400).json({
        success: false,
        error: 'Valid ID is required',
      });
    }

    const orderExists = await database.pool.query({
      text: 'SELECT EXISTS (SELECT * FROM orders WHERE id = $1)',
      values: [id],
    });

    if (!orderExists.rows[0].exists) {
      return res.status(409).json({ success: false, error: 'Order not found' });
    }

    await database.pool.query({
      text: 'update orders set order_status = $1 where id = $2',
      values: ['paid', id],
    });

    res.status(200).json({
      success: true,
      message: 'Order updated successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve update order',
      details: error.message,
    });
  }
};
