const express = require("express");
const path = require("path");
const fs = require("fs");
const router = express.Router();

router.get("/:filename", (req, res) => {
  const filename = req.params.filename;
  const imagePath = path.join(__dirname, "../uploads/products", filename); // Note the ../

  if (fs.existsSync(imagePath)) {
    res.sendFile(imagePath);
  } else {
    res.status(404).json({ error: "Image not found" });
  }
});

module.exports = router;
