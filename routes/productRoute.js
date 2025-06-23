const router = require("express").Router();
const path = require("path");
const fs = require("fs");

const multer = require("multer");
const upload = multer({ dest: "uploads/" });

const productController = require("../controllers/productController");

// router.post("/add-product", productController.addProduct);

router.post(
  "/add-product",
  productController.uploadProductImage,
  productController.addProduct
);

router.get("/products/:id", productController.getProduct);
router.get("/get-products", productController.getAllProducts);
router.delete("/remove-product/:id", productController.removeProduct);
router.put(
  "/update-product/:id",
  upload.single("image"),
  productController.updateProduct
);

router.get("/image/*", (req, res) => {
  const relativePath = req.params[0]; // gets "uploads/products/filename.jpg"
  const imagePath = path.join(__dirname, "../", relativePath);

  console.log("Requested relative path:", relativePath);
  console.log("Full file system path:", imagePath);

  if (fs.existsSync(imagePath)) {
    res.sendFile(imagePath);
  } else {
    console.log("File not found at:", imagePath);
    res.status(404).json({ error: "Image not found" });
  }
});

module.exports = router;
