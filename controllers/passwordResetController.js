const User = require('../models/model');
const Admin = require('../models/adminModel');
const OTP = require('../models/otpModel');
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');

// Generate a random 6-digit OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Configure email transporter (you'll need to set up your email credentials)
const createTransporter = () => {
  return nodemailer.createTransport({
    service: 'gmail', // or your email service
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS // Use app-specific password for Gmail
    }
  });
};

// Send OTP email
const sendOTPEmail = async (email, otp) => {
  try {
    const transporter = createTransporter();
    
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'MCQuiz - Password Reset OTP',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #004581;">MCQuiz Password Reset</h2>
          <p>You have requested to reset your password. Use the following OTP to verify your identity:</p>
          <div style="background-color: #f5f5f5; padding: 20px; text-align: center; margin: 20px 0;">
            <h1 style="color: #018ABD; font-size: 32px; letter-spacing: 5px; margin: 0;">${otp}</h1>
          </div>
          <p><strong>This OTP will expire in 10 minutes.</strong></p>
          <p>If you didn't request this password reset, please ignore this email.</p>
          <hr style="margin: 20px 0;">
          <p style="color: #666; font-size: 12px;">MCQuiz Team</p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error('Email sending error:', error);
    return false;
  }
};

// Request password reset (generate and send OTP)
const requestPasswordReset = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    // Check if user exists (check both User and Admin collections)
    const user = await User.findOne({ email });
    const admin = await Admin.findOne({ email });

    if (!user && !admin) {
      return res.status(404).json({ message: 'No account found with this email address' });
    }

    // Generate OTP
    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Save OTP to database
    const otpRecord = new OTP({
      email,
      otp,
      expiresAt
    });

    await otpRecord.save();

    // Send OTP email
    const emailSent = await sendOTPEmail(email, otp);

    if (!emailSent) {
      // If email fails, remove the OTP record
      await OTP.findByIdAndDelete(otpRecord._id);
      return res.status(500).json({ message: 'Failed to send OTP email. Please try again.' });
    }

    res.status(200).json({ 
      message: 'OTP sent successfully to your email address',
      email: email // Return email for frontend reference
    });

  } catch (error) {
    console.error('Request password reset error:', error);
    res.status(500).json({ message: 'Server error. Please try again.' });
  }
};

// Verify OTP
const verifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ message: 'Email and OTP are required' });
    }

    // Find the most recent valid OTP for this email
    const otpRecord = await OTP.findOne({
      email,
      otp,
      expiresAt: { $gt: new Date() },
      isUsed: false
    }).sort({ createdAt: -1 });

    if (!otpRecord) {
      return res.status(400).json({ message: 'Invalid or expired OTP' });
    }

    // Mark OTP as used
    otpRecord.isUsed = true;
    await otpRecord.save();

    res.status(200).json({ 
      message: 'OTP verified successfully',
      email: email
    });

  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({ message: 'Server error. Please try again.' });
  }
};

// Reset password after OTP verification
const resetPassword = async (req, res) => {
  try {
    const { email, newPassword } = req.body;

    if (!email || !newPassword) {
      return res.status(400).json({ message: 'Email and new password are required' });
    }

    // Validate password strength
    if (newPassword.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters long' });
    }

    // Check if there's a recent verified OTP for this email
    const recentOTP = await OTP.findOne({
      email,
      isUsed: true,
      createdAt: { $gte: new Date(Date.now() - 15 * 60 * 1000) } // Within last 15 minutes
    }).sort({ createdAt: -1 });

    if (!recentOTP) {
      return res.status(400).json({ message: 'Please verify your OTP before resetting password' });
    }

    // Hash the new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Update password in User collection
    let userUpdated = false;
    const user = await User.findOneAndUpdate(
      { email },
      { password: hashedPassword },
      { new: true }
    );

    if (user) {
      userUpdated = true;
    }

    // Update password in Admin collection
    const admin = await Admin.findOneAndUpdate(
      { email },
      { password: hashedPassword },
      { new: true }
    );

    if (admin) {
      userUpdated = true;
    }

    if (!userUpdated) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Clear all OTPs for this email
    await OTP.deleteMany({ email });

    res.status(200).json({ 
      message: 'Password reset successfully. You can now login with your new password.' 
    });

  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ message: 'Server error. Please try again.' });
  }
};

module.exports = {
  requestPasswordReset,
  verifyOTP,
  resetPassword
}; 