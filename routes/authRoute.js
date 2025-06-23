const router = require("express").Router();
const authController = require("../controllers/authController");

router.post("/signup", authController.signup);
router.post("/signin", authController.signin);
router.post("/send-reset-link", authController.sendResetEmail);
router.post("/reset-password", authController.resetPassword);

module.exports = router;
