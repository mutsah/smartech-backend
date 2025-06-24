const router = require('express').Router();

const orderController = require('../controllers/orderController');

router.post('/saveOrder', orderController.saveOrder);
router.get('/getOrders', orderController.getAllOrders);
router.get('/getOrders/:userId', orderController.getOrdersByUserId);
router.put('/update-order/:id', orderController.updateOrder);

module.exports = router;
