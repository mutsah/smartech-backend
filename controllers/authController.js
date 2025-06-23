const database = require("../config/database");
const crypto = require("crypto");
const {
  signupSchema,
  signinSchema,
  passwordResetSchema,
  verifyResetSchema,
} = require("../middlewares/validator");
const { doHash, doHashValidation } = require("../utils/hashing");
const { transport } = require("../middlewares/sendMail");
const generateResetReference = require("../middlewares/resetRef");
const { encrypt, decrypt } = require("../middlewares/encrypt");

exports.signup = async (req, res) => {
  try {
    const { name, email, address, mobileNumber, password } = req.body;

    const { error, value } = signupSchema.validate({
      name,
      email,
      address,
      mobileNumber,
      password,
    });

    if (error) {
      return res
        .status(401)
        .json({ success: false, error: error.details[0].message });
    }

    const emailExists = await database.pool.query({
      text: "SELECT EXISTS (SELECT * FROM users WHERE email = $1)",
      values: [email],
    });

    if (emailExists.rows[0].exists) {
      return res
        .status(409)
        .json({ success: false, error: "user already exits" });
    }

    const hashedPassword = await doHash(password, 12);

    const result = await database.pool.query({
      text: "INSERT INTO users(name,email,address,mobile_number,password,user_type) values($1, $2, $3, $4, $5, $6) RETURNING * ",
      values: [name, email, address, mobileNumber, hashedPassword, "Buyer"],
    });

    let info = await transport.sendMail({
      from: process.env.NODE_CODE_SENDING_EMAIL_ADDRESS,
      to: email,
      subject: "Welcome to Smartech - Shopping",
      html: `

        <p>Hi ${name}</p>
        <p>Welcome to Smartech Shop! Your account has been created and you can log in anytime at http://localhost:5173 to start shopping.</p>
        <p></p>
        <p>Kind regards,</p>
        <p>The Smartech Team</p>
      `,
    });

    if (info.accepted[0] != email) {
      return res.status(409).json({
        success: false,
        error: "email not send",
      });
    }

    res.status(209).json({
      success: true,
      message: "signup successful",
      user: result.rows[0],
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.signin = async (req, res) => {
  try {
    const { email, password } = req.body;

    const { error, value } = signinSchema.validate({ email, password });

    if (error) {
      return res
        .status(401)
        .json({ success: false, error: error.details[0].message });
    }

    const userExists = await database.pool.query({
      text: "SELECT EXISTS (SELECT * FROM users WHERE email = $1)",
      values: [email],
    });

    if (!userExists.rows[0].exists) {
      return res.status(404).json({ success: false, error: "user not found" });
    }

    const savedPassword = await database.pool.query({
      text: "SELECT password from users WHERE email = $1",
      values: [email],
    });

    const result = await doHashValidation(
      password,
      savedPassword.rows[0].password
    );

    if (!result) {
      return res
        .status(400)
        .json({ success: false, error: "incorrect credentials" });
    }

    const user = await database.pool.query({
      text: "SELECT id,name,email,address,mobile_number,user_type from users WHERE email = $1",
      values: [email],
    });

    res.status(200).json({
      success: true,
      message: "logged in successfully",
      user: user.rows[0],
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.sendResetEmail = async (req, res) => {
  try {
    const { email } = req.body;

    const { error, value } = passwordResetSchema.validate({
      email,
    });

    if (error) {
      return res
        .status(401)
        .json({ success: false, error: error.details[0].message });
    }

    const emailExists = await database.pool.query({
      text: "SELECT EXISTS (SELECT * FROM users WHERE email = $1)",
      values: [email],
    });

    if (!emailExists.rows[0].exists) {
      return res.status(404).json({ success: false, error: "email not found" });
    }

    // Force await and ensure we get a string
    const resetReference = await Promise.resolve(generateResetReference());

    // Double-check we have a string
    if (typeof resetReference !== "string") {
      throw new Error(
        `generateResetReference returned ${typeof resetReference} instead of string`
      );
    }

    // Encrypt the reference
    const encryptedReference = encrypt(resetReference);
    const encryptedEmail = encrypt(email);

    // Double-check encrypted reference is a string
    if (typeof encryptedReference !== "string") {
      throw new Error(
        `encrypt returned ${typeof encryptedReference} instead of string`
      );
    }

    if (typeof encryptedEmail !== "string") {
      throw new Error(
        `encrypt returned ${typeof encryptedEmail} instead of string`
      );
    }

    const result = await database.pool.query({
      text: "INSERT INTO password_reset(email,reference) values($1, $2)",
      values: [email, resetReference],
    });

    const url =
      "http://localhost:5173/reset/" +
      encryptedReference +
      "/" +
      encryptedEmail;

    let info = await transport.sendMail({
      from: process.env.NODE_CODE_SENDING_EMAIL_ADDRESS,
      to: email,
      subject: "Password Reset",
      html: `
        <p>Dear user</p>
        <p>Click the link: ${url} to reset your password</p>
        <p></p>
        <p>Kind regards,</p>
        <p>Smartech</p>
      `,
    });

    if (info.accepted[0] != email) {
      return res.status(409).json({
        success: false,
        error: "email not send",
      });
    }

    res.status(200).json({
      success: true,
      message: "reset email sent",
    });
  } catch (error) {
    console.error("Error in sendResetEmail:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { email, reference, password } = req.body;

    const { error, value } = verifyResetSchema.validate({
      email,
      reference,
      password,
    });

    if (error) {
      return res
        .status(401)
        .json({ success: false, error: error.details[0].message });
    }

    const decryptedReference = decrypt(reference);
    const decryptedEmail = decrypt(email);

    const linkExists = await database.pool.query({
      text: "SELECT EXISTS (SELECT * FROM password_reset WHERE email = $1 and reference = $2)",
      values: [decryptedEmail, decryptedReference],
    });

    if (!linkExists.rows[0].exists) {
      return res.status(404).json({ success: false, error: "invalid link" });
    }

    const hashedPassword = await doHash(password, 12);

    const result = await database.pool.query({
      text: "UPDATE USERS SET password = $1 where email = $2",
      values: [hashedPassword, decryptedEmail],
    });

    res.status(200).json({
      success: true,
      message: "password reset successful",
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
