const express = require('express');
const userSubjectRouter = express.Router();
const subjectController = require('../controllers/subjectController');
const { authenticate } = require('../middleware/authMiddleware');

userSubjectRouter.get('/', async (req, res) => {
  try {
    const { level, search, sort, page = 1, limit = 10 } = req.query;
    
    const query = { isActive: true };
    
    if (level) {
      query.level = level;
    }
    
    if (search) {
      query.name = { $regex: search, $options: 'i' };
    }
    
    const sortOptions = {};
    if (sort) {
      const [field, order] = sort.split(':');
      sortOptions[field] = order === 'desc' ? -1 : 1;
    } else {
      sortOptions.name = 1;
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const Subject = require('../models/subjectModel');
    const subjects = await Subject.find(query)
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await Subject.countDocuments(query);
    
    res.status(200).json({
      subjects,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get subjects error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

userSubjectRouter.get('/level/:level', async (req, res) => {
  try {
    const { level } = req.params;
    
    const validLevels = ['Scholarship', 'O/L', 'A/L'];
    if (!validLevels.includes(level)) {
      return res.status(400).json({ message: 'Invalid level. Must be Scholarship, O/L, or A/L' });
    }
    
    const Subject = require('../models/subjectModel');
    const subjects = await Subject.find({ 
      level,
      isActive: true
    }).sort({ name: 1 });
    
    res.status(200).json({ subjects });
  } catch (error) {
    console.error('Get subjects by level error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

userSubjectRouter.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const Subject = require('../models/subjectModel');
    const subject = await Subject.findOne({
      _id: id,
      isActive: true
    });
    
    if (!subject) {
      return res.status(404).json({ message: 'Subject not found or inactive' });
    }
    
    res.status(200).json({ subject });
  } catch (error) {
    console.error('Get subject by ID error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

userSubjectRouter.use(authenticate);

module.exports = userSubjectRouter;