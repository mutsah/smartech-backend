const crypto = require("crypto");
require("dotenv").config();

const algorithm = "aes-256-cbc";

// Validate environment variables
if (!process.env.SECRET_KEY || !process.env.IV_KEY) {
  throw new Error("SECRET_KEY and IV_KEY must be set in environment variables");
}

// Ensure proper key and IV lengths for AES-256-CBC
let key = Buffer.from(process.env.SECRET_KEY, "utf-8");
let iv = Buffer.from(process.env.IV_KEY, "utf-8");

// AES-256-CBC requires 32-byte key and 16-byte IV
if (key.length !== 32) {
  // Pad or truncate key to 32 bytes
  const paddedKey = Buffer.alloc(32);
  key.copy(paddedKey);
  key = paddedKey;
}

if (iv.length !== 16) {
  // Pad or truncate IV to 16 bytes
  const paddedIv = Buffer.alloc(16);
  iv.copy(paddedIv);
  iv = paddedIv;
}

// Encrypt - removed async since crypto operations are synchronous
function encrypt(text) {
  try {
    // Validate input
    if (typeof text !== "string") {
      throw new Error(`encrypt expects string input, got ${typeof text}`);
    }

    console.log("Encrypting text:", text, "Type:", typeof text);

    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");

    console.log("Encrypted result:", encrypted, "Type:", typeof encrypted);

    return encrypted;
  } catch (error) {
    console.error("Encryption error:", error);
    throw error;
  }
}

// Decrypt - removed async since crypto operations are synchronous
function decrypt(encryptedText) {
  try {
    // Validate input
    if (typeof encryptedText !== "string") {
      throw new Error(
        `decrypt expects string input, got ${typeof encryptedText}`
      );
    }

    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    let decrypted = decipher.update(encryptedText, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } catch (error) {
    console.error("Decryption error:", error);
    throw error;
  }
}

module.exports = { encrypt, decrypt };
