
const Quiz = require('../models/quizModel');
const Subject = require('../models/subjectModel');
const mongoose = require('mongoose');

const createQuiz = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { title, description, subject, timeLimit, questions, difficulty, passingScore, subscriptionLevel } = req.body;
    
    if (!title || !subject || !questions || !Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ 
        message: 'Quiz title, subject ID, and at least one question are required' 
      });
    }
    
    const subjectExists = await Subject.findById(subject);
    if (!subjectExists) {
      return res.status(404).json({ message: 'Subject not found' });
    }
    
    if (!['Scholarship', 'O/L', 'A/L'].includes(subjectExists.level)) {
      return res.status(400).json({ message: 'Subject has an invalid level' });
    }
    
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.question || !q.options || !Array.isArray(q.options) || q.options.length < 2 || 
          q.correctAnswer === undefined || q.correctAnswer < 0 || q.correctAnswer >= q.options.length) {
        return res.status(400).json({
          message: `Question ${i + 1} is invalid. Each question must have text, at least 2 options, and a valid correct answer index.`
        });
      }
    }
    
    const quiz = new Quiz({
      title,
      description: description || '',
      subject,
      timeLimit: timeLimit || 0,
      questions,
      difficulty: difficulty || 'Medium',
      passingScore: passingScore !== undefined ? passingScore : 60,
      subscriptionLevel: subscriptionLevel || 'Basic',
      createdBy: req.user.userId
    });
    
    await quiz.save({ session });
    
    await Subject.findByIdAndUpdate(
      subject,
      { $inc: { quizCount: 1 } },
      { session }
    );
    
    await session.commitTransaction();
    session.endSession();
    
    res.status(201).json({
      message: 'Quiz created successfully',
      quiz: {
        _id: quiz._id,
        title: quiz.title,
        subject: quiz.subject,
        questionsCount: quiz.questions.length,
        subscriptionLevel: quiz.subscriptionLevel
      }
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error('Create quiz error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const getAllQuizzes = async (req, res) => {
  try {
    const { subject, search, difficulty, active, subscriptionLevel, sort, page = 1, limit = 10 } = req.query;
    
    const query = {};
    
    if (subject) {
      query.subject = mongoose.Types.ObjectId.isValid(subject) ? subject : null;
    }
    
    if (difficulty) {
      query.difficulty = difficulty;
    }
    
    if (active !== undefined) {
      query.isActive = active === 'true';
    }
    
    if (subscriptionLevel) {
      query.subscriptionLevel = subscriptionLevel;
    }
    
    if (search) {
      query.title = { $regex: search, $options: 'i' };
    }
    
    const sortOptions = {};
    if (sort) {
      const [field, order] = sort.split(':');
      sortOptions[field] = order === 'desc' ? -1 : 1;
    } else {
      sortOptions.createdAt = -1;
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const quizzes = await Quiz.find(query)
      .populate('subject', 'name level')
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await Quiz.countDocuments(query);
    
    const transformedQuizzes = quizzes.map(quiz => ({
      _id: quiz._id,
      title: quiz.title,
      description: quiz.description,
      subject: quiz.subject,
      questionsCount: quiz.questions ? quiz.questions.length : 0,
      timeLimit: quiz.timeLimit,
      difficulty: quiz.difficulty,
      subscriptionLevel: quiz.subscriptionLevel,
      isActive: quiz.isActive,
      createdAt: quiz.createdAt
    }));
    
    res.status(200).json({
      quizzes: transformedQuizzes,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get quizzes error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const getQuizzesBySubject = async (req, res) => {
  try {
    const { subjectId } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(subjectId)) {
      return res.status(400).json({ message: 'Invalid subject ID format' });
    }
    
    const subject = await Subject.findById(subjectId);
    if (!subject) {
      return res.status(404).json({ message: 'Subject not found' });
    }
    
    const quizzes = await Quiz.find({ subject: subjectId })
      .select('title description difficulty subscriptionLevel timeLimit isActive createdAt')
      .sort({ createdAt: -1 });
    
    res.status(200).json({ 
      subject: {
        _id: subject._id,
        name: subject.name,
        level: subject.level
      },
      quizzes,
      count: quizzes.length
    });
  } catch (error) {
    console.error('Get quizzes by subject error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const getQuizById = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid quiz ID format' });
    }
    
    const quiz = await Quiz.findById(id)
      .populate('subject', 'name level');
    
    if (!quiz) {
      return res.status(404).json({ message: 'Quiz not found' });
    }
    
    res.status(200).json({ quiz });
  } catch (error) {
    console.error('Get quiz by ID error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const updateQuiz = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid quiz ID format' });
    }
    
    const { title, description, subject, timeLimit, questions, difficulty, passingScore, isActive, subscriptionLevel } = req.body;
    
    const quiz = await Quiz.findById(id);
    
    if (!quiz) {
      return res.status(404).json({ message: 'Quiz not found' });
    }
    
    let oldSubjectId = null;
    if (subject && String(quiz.subject) !== String(subject)) {
      if (!mongoose.Types.ObjectId.isValid(subject)) {
        return res.status(400).json({ message: 'Invalid subject ID format' });
      }
      
      const newSubject = await Subject.findById(subject);
      if (!newSubject) {
        return res.status(404).json({ message: 'New subject not found' });
      }
      
      oldSubjectId = quiz.subject;
      quiz.subject = subject;
    }
    
    if (title) quiz.title = title;
    if (description !== undefined) quiz.description = description;
    if (timeLimit !== undefined) quiz.timeLimit = parseInt(timeLimit);
    if (difficulty) quiz.difficulty = difficulty;
    if (passingScore !== undefined) quiz.passingScore = parseInt(passingScore);
    if (isActive !== undefined) quiz.isActive = isActive;
    if (subscriptionLevel !== undefined) quiz.subscriptionLevel = subscriptionLevel;
    
    if (questions && Array.isArray(questions)) {
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        if (!q.question || !q.options || !Array.isArray(q.options) || q.options.length < 2 || 
            q.correctAnswer === undefined || q.correctAnswer < 0 || q.correctAnswer >= q.options.length) {
          return res.status(400).json({
            message: `Question ${i + 1} is invalid. Each question must have text, at least 2 options, and a valid correct answer index.`
          });
        }
      }
      
      quiz.questions = questions;
    }
    
    await quiz.save({ session });
    
    if (oldSubjectId) {
      await Subject.findByIdAndUpdate(
        oldSubjectId,
        { $inc: { quizCount: -1 } },
        { session }
      );
      
      await Subject.findByIdAndUpdate(
        subject,
        { $inc: { quizCount: 1 } },
        { session }
      );
    }
    
    await session.commitTransaction();
    session.endSession();
    
    res.status(200).json({
      message: 'Quiz updated successfully',
      quiz: {
        _id: quiz._id,
        title: quiz.title,
        subject: quiz.subject,
        questionsCount: quiz.questions.length,
        subscriptionLevel: quiz.subscriptionLevel,
        isActive: quiz.isActive
      }
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error('Update quiz error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const deleteQuiz = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid quiz ID format' });
    }
    
    const quiz = await Quiz.findById(id);
    
    if (!quiz) {
      return res.status(404).json({ message: 'Quiz not found' });
    }
    
    const subjectId = quiz.subject;
    
    await Quiz.findByIdAndDelete(id, { session });
    
    await Subject.findByIdAndUpdate(
      subjectId,
      { $inc: { quizCount: -1 } },
      { session }
    );
    
    await session.commitTransaction();
    session.endSession();
    
    res.status(200).json({ message: 'Quiz deleted successfully' });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error('Delete quiz error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const getQuizStats = async (req, res) => {
  try {
    const totalQuizzes = await Quiz.countDocuments();
    
    const difficultyStats = await Quiz.aggregate([
      {
        $group: {
          _id: '$difficulty',
          count: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);
    
    const subscriptionLevelStats = await Quiz.aggregate([
      {
        $group: {
          _id: '$subscriptionLevel',
          count: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);
    
    const subjectStats = await Quiz.aggregate([
      {
        $group: {
          _id: '$subject',
          count: { $sum: 1 }
        }
      }
    ]);
    
    const subjectIds = subjectStats.map(stat => stat._id);
    const subjects = await Subject.find({ _id: { $in: subjectIds } });
    
    const subjectMap = {};
    subjects.forEach(subject => {
      subjectMap[subject._id] = {
        name: subject.name,
        level: subject.level
      };
    });
    
    const formattedSubjectStats = subjectStats.map(stat => ({
      subjectId: stat._id,
      subjectName: subjectMap[stat._id]?.name || 'Unknown',
      level: subjectMap[stat._id]?.level || 'Unknown',
      quizCount: stat.count
    }));
    
    res.status(200).json({
      totalQuizzes,
      byDifficulty: difficultyStats.map(stat => ({
        difficulty: stat._id,
        count: stat.count
      })),
      bySubscriptionLevel: subscriptionLevelStats.map(stat => ({
        subscriptionLevel: stat._id,
        count: stat.count
      })),
      bySubject: formattedSubjectStats
    });
  } catch (error) {
    console.error('Get quiz stats error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = {
  createQuiz,
  getAllQuizzes,
  getQuizzesBySubject,
  getQuizById,
  updateQuiz,
  deleteQuiz,
  getQuizStats
};