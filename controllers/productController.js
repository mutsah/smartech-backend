const database = require("../config/database");
const {
  addProductSchema,
  updateProductSchema,
} = require("../middlewares/validator");

const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { error } = require("console");

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = "uploads/products/";
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, "product-" + uniqueSuffix + path.extname(file.originalname));
  },
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const extname = allowedTypes.test(
    path.extname(file.originalname).toLowerCase()
  );
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error("Only image files are allowed!"), false);
  }
};

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: fileFilter,
});

exports.uploadProductImage = upload.single("image");

exports.addProduct = async (req, res) => {
  try {
    const { title, description, price, stock, category } = req.body;

    // Get image path if uploaded
    const imagePath = req.file ? req.file.path : null;

    const { error, value } = addProductSchema.validate({
      title,
      description,
      price,
      stock,
      category,
    });

    if (error) {
      // Delete uploaded file if validation fails
      if (imagePath && fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
      return res
        .status(401)
        .json({ success: false, error: error.details[0].message });
    }

    const productExists = await database.pool.query({
      text: "SELECT EXISTS (SELECT * FROM products WHERE title = $1)",
      values: [title],
    });

    if (productExists.rows[0].exists) {
      // Delete uploaded file if product already exists
      if (imagePath && fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
      return res
        .status(409)
        .json({ success: false, error: "Product already exists" });
    }

    // Insert product with image path
    const result = await database.pool.query({
      text: "INSERT INTO products(title, description, price, image_path,stock, category) VALUES($1, $2, $3, $4, $5, $6) RETURNING id",
      values: [title, description, price, imagePath, stock, category],
    });

    const productId = result.rows[0].id;

    res.status(201).json({
      success: true,
      message: "Product created successfully",
      data: {
        id: productId,
        title,
        description,
        price,
        image_path: imagePath,
      },
    });
  } catch (error) {
    // Delete uploaded file if database error occurs
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getProduct = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await database.pool.query({
      text: "SELECT * FROM products WHERE id = $1",
      values: [id],
    });

    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, error: "Product not found" });
    }

    const product = result.rows[0];

    res.status(200).json({
      success: true,
      data: product,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getAllProducts = async (req, res) => {
  try {
    const result = await database.pool.query({
      text: "SELECT * FROM products ORDER BY id DESC",
    });

    res.status(200).json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.removeProduct = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || isNaN(id)) {
      return res.status(400).json({
        success: false,
        error: "Valid product ID is required",
      });
    }

    const productExists = await database.pool.query({
      text: "SELECT EXISTS (SELECT * FROM products WHERE id = $1)",
      values: [id],
    });

    if (!productExists.rows[0].exists) {
      return res
        .status(409)
        .json({ success: false, error: "Product not found" });
    }

    await database.pool.query({
      text: "DELETE FROM products where id = $1",
      values: [id],
    });

    res
      .status(200)
      .json({ success: true, message: "Product removed successfully" });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, price, stock, category } = req.body;
    const imagePath = req.file ? req.file.path : null;

    const { error, value } = updateProductSchema.validate({
      title,
      description,
      price,
      stock,
      category,
    });

    if (error) {
      if (imagePath && fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
      return res
        .status(400)
        .json({ success: false, error: error.details[0].message });
    }

    const productResult = await database.pool.query({
      text: "SELECT id, image_path FROM products WHERE id = $1",
      values: [id],
    });

    if (!productResult.rows[0]) {
      if (imagePath && fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
      return res
        .status(404)
        .json({ success: false, error: "Product not found" });
    }

    const currentImagePath = productResult.rows[0].image_path;

    if (title && title.trim() !== "") {
      const titleConflict = await database.pool.query({
        text: "SELECT EXISTS (SELECT 1 FROM products WHERE title = $1 AND id != $2)",
        values: [title, id],
      });

      if (titleConflict.rows[0].exists) {
        if (imagePath && fs.existsSync(imagePath)) {
          fs.unlinkSync(imagePath);
        }
        return res
          .status(409)
          .json({ success: false, error: "Product title already in use" });
      }
    }

    const updateFields = [];
    const values = [];
    let paramIndex = 1;

    if (title !== undefined && title !== null && String(title).trim() !== "") {
      updateFields.push(`title = $${paramIndex}`);
      values.push(String(title).trim());
      paramIndex++;
    }

    if (
      description !== undefined &&
      description !== null &&
      String(description).trim() !== ""
    ) {
      updateFields.push(`description = $${paramIndex}`);
      values.push(String(description).trim());
      paramIndex++;
    }

    if (price !== undefined && price !== null && String(price).trim() !== "") {
      const numPrice = parseFloat(price);
      if (!isNaN(numPrice) && numPrice > 0) {
        updateFields.push(`price = $${paramIndex}`);
        values.push(numPrice);
        paramIndex++;
      }
    }

    if (stock !== undefined && stock !== null && String(stock).trim() !== "") {
      const numStock = parseInt(stock);
      if (!isNaN(numStock) && numStock >= 0) {
        updateFields.push(`stock = $${paramIndex}`);
        values.push(numStock);
        paramIndex++;
      }
    }

    if (
      category !== undefined &&
      category !== null &&
      String(category).trim() !== ""
    ) {
      updateFields.push(`category = $${paramIndex}`); // Fixed: Added $ prefix
      values.push(String(category).trim());
      paramIndex++;
    }

    updateFields.push(`updated_at = NOW()`);

    if (imagePath) {
      updateFields.push(`image_path = $${paramIndex}`);
      values.push(imagePath);
      paramIndex++;
    }

    values.push(id);

    if (updateFields.length === 1) {
      if (imagePath && fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
      return res
        .status(400)
        .json({ success: false, error: "No valid fields provided for update" });
    }

    const queryText = `
      UPDATE products 
      SET ${updateFields.join(", ")}
      WHERE id = $${values.length}
      RETURNING *
    `;

    const result = await database.pool.query({
      text: queryText,
      values: values,
    });

    if (imagePath && currentImagePath && fs.existsSync(currentImagePath)) {
      fs.unlinkSync(currentImagePath);
    }

    const updatedProduct = result.rows[0];

    res.status(200).json({
      success: true,
      message: "Product updated successfully",
      data: {
        id: updatedProduct.id,
        title: updatedProduct.title,
        description: updatedProduct.description,
        price: updatedProduct.price,
        image_path: updatedProduct.image_path,
        stock: updatedProduct.stock,
        category: updatedProduct.category,
        created_at: updatedProduct.created_at,
        updated_at: updatedProduct.updated_at,
      },
    });
  } catch (error) {
    console.error("Update Product Error:", error);
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ success: false, error: error.message });
  }
};
