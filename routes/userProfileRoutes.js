const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { authenticate } = require('../middleware/authMiddleware');
const User = require('../models/model');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../uploads/profile-pictures');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'profile-' + req.user.userId + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: function (req, file, cb) {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  }
});

// Get user profile
router.get('/profile', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Add full URL to profile picture
    const userWithProfilePicture = {
      ...user.toObject(),
      profilePicture: user.profilePicture ? getFullProfilePictureUrl(user.profilePicture) : null
    };
    
    res.json({ user: userWithProfilePicture });
  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update user profile
router.put('/update-profile', authenticate, async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email
    } = req.body;

    // Check if email is being changed and if it's already taken
    if (email && email !== req.user.email) {
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({ message: 'Email already exists' });
      }
    }

    const updateData = {
      firstName: firstName || req.user.firstName,
      lastName: lastName || req.user.lastName,
      email: email || req.user.email
    };

    const user = await User.findByIdAndUpdate(
      req.user.userId,
      updateData,
      { new: true, runValidators: true }
    ).select('-password');

    // Add full URL to profile picture
    const userWithProfilePicture = {
      ...user.toObject(),
      profilePicture: user.profilePicture ? getFullProfilePictureUrl(user.profilePicture) : null
    };

    res.json({ user: userWithProfilePicture, message: 'Profile updated successfully' });
  } catch (error) {
    console.error('Error updating user profile:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Upload profile picture
router.post('/upload-profile-picture', authenticate, upload.single('profilePicture'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    // Delete old profile picture if exists
    const user = await User.findById(req.user.userId);
    if (user.profilePicture && !user.profilePicture.includes('default-profile')) {
      const oldPicturePath = path.join(__dirname, '..', user.profilePicture);
      if (fs.existsSync(oldPicturePath)) {
        fs.unlinkSync(oldPicturePath);
      }
    }

    // Update user with new profile picture path (relative path)
    const relativePath = path.relative(path.join(__dirname, '..'), req.file.path).replace(/\\/g, '/');
    const updatedUser = await User.findByIdAndUpdate(
      req.user.userId,
      { profilePicture: relativePath },
      { new: true }
    ).select('-password');

    // Return the full URL for the frontend
    const profilePictureUrl = getFullProfilePictureUrl(relativePath);

    res.json({ 
      user: {
        ...updatedUser.toObject(),
        profilePicture: profilePictureUrl
      }, 
      profilePicture: profilePictureUrl,
      message: 'Profile picture uploaded successfully' 
    });
  } catch (error) {
    console.error('Error uploading profile picture:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Helper function to get full profile picture URL
function getFullProfilePictureUrl(relativePath) {
  if (!relativePath) return null;
  
  // If it's already a full URL (from previous uploads), return as is
  if (relativePath.startsWith('http')) {
    return relativePath;
  }
  
  // If it's a default image or already properly formatted
  if (relativePath.includes('default-profile')) {
    return `/uploads/profile-pictures/${relativePath}`;
  }
  
  // Construct full URL for uploaded images
  return `http://localhost:3001/uploads/profile-pictures/${path.basename(relativePath)}`;
}

// Serve profile pictures - FIXED route
router.get('/uploads/profile-pictures/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(__dirname, '../uploads/profile-pictures', filename);
  
  console.log('Serving profile picture:', { filename, filePath, exists: fs.existsSync(filePath) });
  
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    // Serve a default image if the requested file doesn't exist
    const defaultImagePath = path.join(__dirname, '../uploads/profile-pictures/default-profile.png');
    if (fs.existsSync(defaultImagePath)) {
      res.sendFile(defaultImagePath);
    } else {
      res.status(404).json({ message: 'Profile picture not found' });
    }
  }
});

// Create default profile picture if it doesn't exist
const createDefaultProfilePicture = () => {
  const defaultImagePath = path.join(__dirname, '../uploads/profile-pictures/default-profile.png');
  const defaultImageDir = path.dirname(defaultImagePath);
  
  if (!fs.existsSync(defaultImageDir)) {
    fs.mkdirSync(defaultImageDir, { recursive: true });
  }
  
  if (!fs.existsSync(defaultImagePath)) {
    // You can create a simple default image here or copy one from your assets
    console.log('Default profile picture does not exist. Please add a default-profile.png to uploads/profile-pictures/');
  }
};

// Create default directory and image on startup
createDefaultProfilePicture();

module.exports = router;