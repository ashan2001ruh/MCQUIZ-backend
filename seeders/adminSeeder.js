const mongoose = require('mongoose');
const Admin = require('../models/adminModel');
require('dotenv').config();

const uri = process.env.MONGODB_URI;

// Verify required environment variables
const verifyEnvVariables = () => {
  const requiredVars = [
    'MONGODB_URI',
    'ADMIN_EMAIL_1',
    'ADMIN_PASSWORD_1'
  ];

  const missingVars = requiredVars.filter(varName => !process.env[varName]);

  if (missingVars.length > 0) {
    console.error('Missing required environment variables:', missingVars.join(', '));
    process.exit(1);
  }
};

const createAdmins = async () => {
  try {
    verifyEnvVariables();
    
    console.log('Connecting to MongoDB...');
    await mongoose.connect(uri);
    console.log('Connected to MongoDB');

    const adminAccounts = [
      {
        email: process.env.ADMIN_EMAIL_1,
        password: process.env.ADMIN_PASSWORD_1
      }
    ];

    for (const account of adminAccounts) {
      console.log(`Processing admin: ${account.email}`);
      
      if (!account.email || !account.password) {
        console.error('Missing email or password for admin account');
        continue;
      }

      const adminExists = await Admin.findOne({ email: account.email });
      
      if (adminExists) {
        console.log(`Admin ${account.email} already exists`);
        continue;
      }
      
      const admin = new Admin({
        email: account.email,
        password: account.password,
      });
      
      await admin.save();
      console.log(`Admin ${account.email} created successfully`);
    }

    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  } catch (error) {
    console.error('Error in admin creation process:', error);
    process.exit(1);
  }
};

createAdmins();