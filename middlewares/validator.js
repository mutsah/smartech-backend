const Joi = require("joi");

exports.signupSchema = Joi.object({
  name: Joi.string().required(),
  email: Joi.string().min(6).max(60).required().email(),
  address: Joi.string(),
  mobileNumber: Joi.string(),
  password: Joi.string().required(),
});

exports.signinSchema = Joi.object({
  email: Joi.string().min(6).max(60).required().email(),
  password: Joi.string().required(),
});

exports.passwordResetSchema = Joi.object({
  email: Joi.string().min(6).max(60).required().email(),
});

exports.verifyResetSchema = Joi.object({
  email: Joi.string().required(),
  reference: Joi.string().required(),
  password: Joi.string().required(),
});

exports.updateProductSchema = Joi.object({
  title: Joi.string().min(1).max(255).optional(),
  description: Joi.string().max(1000).optional().allow(""),
  price: Joi.number().positive().optional(),
  stock: Joi.number().integer().min(0).optional(),
  category: Joi.string().min(1).max(100).optional(),
});

// exports.updateProductSchema = Joi.object({
//   title: Joi.string().min(3).max(100),
//   description: Joi.string().min(10).max(1000),
//   price: Joi.number().positive().precision(2),
//   stock: Joi.number().integer().min(0),
//   category: Joi.string().min(3).max(50),
// });

exports.saveOrderSchema = Joi.object({
  userId: Joi.number().required(),
  totalAmount: Joi.number().required(),
  shippingFee: Joi.number().required(),
  shippingAddress: Joi.string().required(),
  orderItems: Joi.required(),
});
