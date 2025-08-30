const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    index: true
  },
  otp: {
    type: String,
    required: true
  },
  expiresAt: {
    type: Date,
    required: true,
    index: { expireAfterSeconds: 0 } // Auto-delete expired OTPs
  },
  isUsed: {
    type: Boolean,
    default: false
  },
  attempts: {
    type: Number,
    default: 0
  }
}, { timestamps: true });

// Index for faster queries and automatic cleanup
otpSchema.index({ email: 1, createdAt: -1 });

const OTP = mongoose.model('OTP', otpSchema);

module.exports = OTP; 