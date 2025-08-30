const Subject = require('../models/subjectModel');

const createSubject = async (req, res) => {
  try {
    const { name, level, description } = req.body;
    
    if (!name || !level) {
      return res.status(400).json({ message: 'Subject name and level are required' });
    }
    
    const validLevels = ['Scholarship', 'O/L', 'A/L'];
    if (!validLevels.includes(level)) {
      return res.status(400).json({ message: 'Invalid level. Must be Scholarship, O/L, or A/L' });
    }
    
    const existingSubject = await Subject.findOne({ name, level });
    if (existingSubject) {
      return res.status(409).json({ message: 'Subject already exists for this level' });
    }
    
    const subject = new Subject({
      name,
      level,
      description: description || '',
      createdBy: req.user.userId
    });
    
    await subject.save();
    
    res.status(201).json({
      message: 'Subject created successfully',
      subject
    });
  } catch (error) {
    console.error('Create subject error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const getAllSubjects = async (req, res) => {
  try {
    const { level, search, sort, page = 1, limit = 10 } = req.query;
    
    const query = {};
    
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
      sortOptions.createdAt = -1;
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
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
};

const getSubjectsByLevel = async (req, res) => {
  try {
    const { level } = req.params;
    
    const validLevels = ['Scholarship', 'O/L', 'A/L'];
    if (!validLevels.includes(level)) {
      return res.status(400).json({ message: 'Invalid level. Must be Scholarship, O/L, or A/L' });
    }
    
    const subjects = await Subject.find({ level }).sort({ name: 1 });
    
    res.status(200).json({ subjects });
  } catch (error) {
    console.error('Get subjects by level error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const getSubjectById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const subject = await Subject.findById(id);
    
    if (!subject) {
      return res.status(404).json({ message: 'Subject not found' });
    }
    
    res.status(200).json({ subject });
  } catch (error) {
    console.error('Get subject by ID error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const updateSubject = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, level, description, isActive } = req.body;
    
    const subject = await Subject.findById(id);
    
    if (!subject) {
      return res.status(404).json({ message: 'Subject not found' });
    }
    
    if (name && level && (name !== subject.name || level !== subject.level)) {
      const existingSubject = await Subject.findOne({ 
        name, 
        level,
        _id: { $ne: id }
      });
      
      if (existingSubject) {
        return res.status(409).json({ message: 'Subject already exists for this level' });
      }
    }
    
    if (name) subject.name = name;
    if (level) subject.level = level;
    if (description !== undefined) subject.description = description;
    if (isActive !== undefined) subject.isActive = isActive;
    
    await subject.save();
    
    res.status(200).json({
      message: 'Subject updated successfully',
      subject
    });
  } catch (error) {
    console.error('Update subject error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
const deleteSubject = async (req, res) => {
  try {
    const { id } = req.params;
    
    const subject = await Subject.findById(id);
    
    if (!subject) {
      return res.status(404).json({ message: 'Subject not found' });
    }
    
    if (subject.quizCount > 0) {
      return res.status(400).json({ 
        message: 'Cannot delete subject with associated quizzes. Remove the quizzes first or deactivate the subject instead.' 
      });
    }
    
    await Subject.findByIdAndDelete(id);
    
    res.status(200).json({ message: 'Subject deleted successfully' });
  } catch (error) {
    console.error('Delete subject error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const getSubjectStats = async (req, res) => {
  try {
    const levelStats = await Subject.aggregate([
      {
        $group: {
          _id: '$level',
          count: { $sum: 1 },
          totalQuizzes: { $sum: '$quizCount' }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);
    
    const totalSubjects = await Subject.countDocuments();
    
    const quizStats = await Subject.aggregate([
      {
        $group: {
          _id: null,
          totalQuizzes: { $sum: '$quizCount' }
        }
      }
    ]);
    
    const totalQuizzes = quizStats.length > 0 ? quizStats[0].totalQuizzes : 0;
    
    res.status(200).json({
      totalSubjects,
      totalQuizzes,
      byLevel: levelStats.map(stat => ({
        level: stat._id,
        subjectCount: stat.count,
        quizCount: stat.totalQuizzes
      }))
    });
  } catch (error) {
    console.error('Get subject stats error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = {
  createSubject,
  getAllSubjects,
  getSubjectsByLevel,
  getSubjectById,
  updateSubject,
  deleteSubject,
  getSubjectStats
};