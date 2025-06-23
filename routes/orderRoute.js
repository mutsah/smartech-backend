const router = require("express").Router();

const orderController = require("../controllers/orderController");

router.post("/saveOrder", orderController.saveOrder);
router.get("/getOrders", orderController.getAllOrders);
router.get("/getOrders/:userId", orderController.getOrdersByUserId);

module.exports = router;
