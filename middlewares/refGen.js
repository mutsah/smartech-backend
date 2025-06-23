const database = require("../config/database");
const crypto = require("crypto");

async function generateUniqueReference() {
  const generateRandomValue = () => crypto.randomBytes(8).toString("hex");

  let unique = false;
  let reference;

  while (!unique) {
    reference = generateRandomValue();

    try {
      // Check if the reference already exists in the database
      const referenceExists = await database.pool.query({
        text: "SELECT EXISTS (SELECT 1 FROM users WHERE client = $1)",
        values: [reference],
      });

      if (!referenceExists.rows[0].exists) {
        unique = true;
      }
    } catch (err) {
      console.error("Database error:", err);
      throw new Error("Failed to check unique reference");
    }
  }

  return reference;
}

module.exports = generateUniqueReference;
