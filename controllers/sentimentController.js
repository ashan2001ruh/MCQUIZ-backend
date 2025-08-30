const Feedback = require('../models/feedbackModel');
const User = require('../models/model');
const path = require('path');
const fs = require('fs');

// Load the pickle model (we'll use a Python script for this)
const pythonScriptPath = path.join(__dirname, '../scripts/sentiment_analysis.py');

// Function to run Python script for sentiment analysis
const runSentimentAnalysis = async (text) => {
  return new Promise((resolve, reject) => {
    const { spawn } = require('child_process');
    const pythonProcess = spawn('python', [pythonScriptPath, text]);
    
    let result = '';
    let error = '';
    
    pythonProcess.stdout.on('data', (data) => {
      result += data.toString();
    });
    
    pythonProcess.stderr.on('data', (data) => {
      error += data.toString();
    });
    
    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Python script failed with code ${code}: ${error}`));
        return;
      }
      
      try {
        const prediction = JSON.parse(result.trim());
        resolve(prediction);
      } catch (parseError) {
        reject(new Error(`Failed to parse Python output: ${parseError.message}`));
      }
    });
    
    pythonProcess.on('error', (err) => {
      reject(new Error(`Failed to start Python process: ${err.message}`));
    });
  });
};

// Submit feedback with sentiment analysis
const submitFeedback = async (req, res) => {
  try {
    const { feedback } = req.body;
    const userId = req.user.userId;

    if (!feedback || !feedback.trim()) {
      return res.status(400).json({ message: 'Feedback text is required' });
    }

    // Validate user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Run sentiment analysis
    let sentimentResult;
    try {
      sentimentResult = await runSentimentAnalysis(feedback.trim());
    } catch (error) {
      console.error('Sentiment analysis error:', error);
      // Fallback: use a simple rule-based approach
      sentimentResult = {
        sentiment: feedback.toLowerCase().includes('good') || 
                  feedback.toLowerCase().includes('great') || 
                  feedback.toLowerCase().includes('excellent') || 
                  feedback.toLowerCase().includes('love') || 
                  feedback.toLowerCase().includes('amazing') ? 'positive' : 'negative',
        confidence: 0.6
      };
    }

    // Create feedback record
    const newFeedback = new Feedback({
      user: userId,
      feedback: feedback.trim(),
      sentiment: sentimentResult.sentiment,
      confidence: sentimentResult.confidence || 0.6
    });

    await newFeedback.save();

    res.status(201).json({
      message: 'Feedback submitted successfully',
      feedback: {
        id: newFeedback._id,
        text: newFeedback.feedback,
        sentiment: newFeedback.sentiment,
        confidence: newFeedback.confidence,
        createdAt: newFeedback.createdAt
      }
    });

  } catch (error) {
    console.error('Submit feedback error:', error);
    res.status(500).json({ message: 'Server error. Please try again.' });
  }
};

// Get all feedback (admin only)
const getAllFeedback = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const filter = req.query.filter || 'all'; // 'all', 'positive', 'negative'
    const confidenceFilter = req.query.confidence || 'all'; // 'all', 'high', 'medium', 'low'
    const dateRange = req.query.dateRange || 'all'; // 'all', 'today', 'week', 'month'
    const sortBy = req.query.sortBy || 'createdAt'; // 'createdAt', 'confidence', 'sentiment'
    const sortOrder = req.query.sortOrder || 'desc'; // 'asc', 'desc'

    // Build query filters
    const query = { isActive: true };
    
    // Sentiment filter
    if (filter !== 'all') {
      query.sentiment = filter;
    }
    
    // Confidence filter
    if (confidenceFilter !== 'all') {
      switch (confidenceFilter) {
        case 'high':
          query.confidence = { $gte: 0.8 };
          break;
        case 'medium':
          query.confidence = { $gte: 0.6, $lt: 0.8 };
          break;
        case 'low':
          query.confidence = { $lt: 0.6 };
          break;
      }
    }
    
    // Date range filter
    if (dateRange !== 'all') {
      const now = new Date();
      let startDate;
      
      switch (dateRange) {
        case 'today':
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          break;
        case 'week':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
      }
      
      if (startDate) {
        query.createdAt = { $gte: startDate };
      }
    }

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    const [feedback, total] = await Promise.all([
      Feedback.find(query)
        .populate('user', 'firstName lastName email')
        .sort(sort)
        .skip(skip)
        .limit(limit),
      Feedback.countDocuments(query)
    ]);

    const totalPages = Math.ceil(total / limit);

    res.status(200).json({
      feedback,
      pagination: {
        currentPage: page,
        totalPages,
        totalItems: total,
        itemsPerPage: limit
      },
      filters: {
        applied: {
          sentiment: filter,
          confidence: confidenceFilter,
          dateRange: dateRange,
          sortBy: sortBy,
          sortOrder: sortOrder
        }
      }
    });

  } catch (error) {
    console.error('Get all feedback error:', error);
    res.status(500).json({ message: 'Server error. Please try again.' });
  }
};

// Get feedback statistics
const getFeedbackStats = async (req, res) => {
  try {
    const [positiveCount, negativeCount, totalCount] = await Promise.all([
      Feedback.countDocuments({ sentiment: 'positive', isActive: true }),
      Feedback.countDocuments({ sentiment: 'negative', isActive: true }),
      Feedback.countDocuments({ isActive: true })
    ]);

    // Calculate percentages
    const positivePercentage = totalCount > 0 ? ((positiveCount / totalCount) * 100).toFixed(1) : 0;
    const negativePercentage = totalCount > 0 ? ((negativeCount / totalCount) * 100).toFixed(1) : 0;

    // Get recent feedback trend (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentStats = await Feedback.aggregate([
      {
        $match: {
          createdAt: { $gte: sevenDaysAgo },
          isActive: true
        }
      },
      {
        $group: {
          _id: '$sentiment',
          count: { $sum: 1 }
        }
      }
    ]);

    const recentPositive = recentStats.find(s => s._id === 'positive')?.count || 0;
    const recentNegative = recentStats.find(s => s._id === 'negative')?.count || 0;

    // Get confidence distribution
    const confidenceStats = await Feedback.aggregate([
      {
        $match: { isActive: true }
      },
      {
        $group: {
          _id: {
            $cond: [
              { $gte: ['$confidence', 0.8] }, 'high',
              { $cond: [{ $gte: ['$confidence', 0.6] }, 'medium', 'low'] }
            ]
          },
          count: { $sum: 1 },
          avgConfidence: { $avg: '$confidence' }
        }
      }
    ]);

    const confidenceDistribution = {
      high: confidenceStats.find(s => s._id === 'high')?.count || 0,
      medium: confidenceStats.find(s => s._id === 'medium')?.count || 0,
      low: confidenceStats.find(s => s._id === 'low')?.count || 0
    };

    res.status(200).json({
      overall: {
        positive: positiveCount,
        negative: negativeCount,
        total: totalCount,
        positivePercentage: parseFloat(positivePercentage),
        negativePercentage: parseFloat(negativePercentage)
      },
      recent: {
        positive: recentPositive,
        negative: recentNegative,
        total: recentPositive + recentNegative
      },
      confidence: confidenceDistribution
    });

  } catch (error) {
    console.error('Get feedback stats error:', error);
    res.status(500).json({ message: 'Server error. Please try again.' });
  }
};

// Get sentiment trends over time
const getSentimentTrends = async (req, res) => {
  try {
    const period = req.query.period || 'week'; // 'week', 'month', 'quarter'
    const now = new Date();
    let startDate;
    let groupBy;

    switch (period) {
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        groupBy = {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' },
          day: { $dayOfMonth: '$createdAt' }
        };
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        groupBy = {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' },
          day: { $dayOfMonth: '$createdAt' }
        };
        break;
      case 'quarter':
        startDate = new Date(now.getFullYear(), now.getMonth() - 3, 1);
        groupBy = {
          year: { $year: '$createdAt' },
          week: { $week: '$createdAt' }
        };
        break;
      default:
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        groupBy = {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' },
          day: { $dayOfMonth: '$createdAt' }
        };
    }

    const trends = await Feedback.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate },
          isActive: true
        }
      },
      {
        $group: {
          _id: {
            ...groupBy,
            sentiment: '$sentiment'
          },
          count: { $sum: 1 },
          avgConfidence: { $avg: '$confidence' }
        }
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1, '_id.week': 1 }
      }
    ]);

    // Format the trends data for easier consumption
    const formattedTrends = trends.reduce((acc, item) => {
      const dateKey = period === 'quarter' 
        ? `${item._id.year}-W${item._id.week}`
        : `${item._id.year}-${String(item._id.month).padStart(2, '0')}-${String(item._id.day).padStart(2, '0')}`;
      
      if (!acc[dateKey]) {
        acc[dateKey] = { positive: 0, negative: 0, total: 0 };
      }
      
      acc[dateKey][item._id.sentiment] = item.count;
      acc[dateKey].total += item.count;
      
      return acc;
    }, {});

    res.status(200).json({
      period,
      trends: formattedTrends,
      summary: {
        totalDays: Object.keys(formattedTrends).length,
        avgFeedbackPerDay: Object.values(formattedTrends).reduce((sum, day) => sum + day.total, 0) / Object.keys(formattedTrends).length || 0
      }
    });

  } catch (error) {
    console.error('Get sentiment trends error:', error);
    res.status(500).json({ message: 'Server error. Please try again.' });
  }
};

// Get user's own feedback
const getUserFeedback = async (req, res) => {
  try {
    const userId = req.user.userId;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 5;
    const skip = (page - 1) * limit;

    const [feedback, total] = await Promise.all([
      Feedback.find({ user: userId, isActive: true })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Feedback.countDocuments({ user: userId, isActive: true })
    ]);

    const totalPages = Math.ceil(total / limit);

    res.status(200).json({
      feedback,
      pagination: {
        currentPage: page,
        totalPages,
        totalItems: total,
        itemsPerPage: limit
      }
    });

  } catch (error) {
    console.error('Get user feedback error:', error);
    res.status(500).json({ message: 'Server error. Please try again.' });
  }
};

// Delete feedback (admin or owner)
const deleteFeedback = async (req, res) => {
  try {
    const { feedbackId } = req.params;
    const userId = req.user.userId;
    const userRole = req.user.role;

    const feedback = await Feedback.findById(feedbackId);
    if (!feedback) {
      return res.status(404).json({ message: 'Feedback not found' });
    }

    // Only admin or feedback owner can delete
    if (userRole !== 'admin' && feedback.user.toString() !== userId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    feedback.isActive = false;
    await feedback.save();

    res.status(200).json({ message: 'Feedback deleted successfully' });

  } catch (error) {
    console.error('Delete feedback error:', error);
    res.status(500).json({ message: 'Server error. Please try again.' });
  }
};

// Bulk operations for feedback management
const bulkUpdateFeedback = async (req, res) => {
  try {
    const { feedbackIds, action, metadata = {} } = req.body;
    const userId = req.user.userId;
    const userRole = req.user.role;

    if (!feedbackIds || !Array.isArray(feedbackIds) || feedbackIds.length === 0) {
      return res.status(400).json({ message: 'Feedback IDs are required' });
    }

    if (!action) {
      return res.status(400).json({ message: 'Action is required' });
    }

    // Only admin can perform bulk operations
    if (userRole !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin privileges required.' });
    }

    let updateQuery = {};
    let message = '';

    switch (action) {
      case 'delete':
        updateQuery = { isActive: false };
        message = 'Feedback items deleted successfully';
        break;
      case 'mark_reviewed':
        updateQuery = { reviewed: true, reviewedBy: userId, reviewedAt: new Date() };
        message = 'Feedback items marked as reviewed';
        break;
      case 'mark_addressed':
        updateQuery = { 
          addressed: true, 
          addressedBy: userId, 
          addressedAt: new Date(),
          response: metadata.response || ''
        };
        message = 'Feedback items marked as addressed';
        break;
      default:
        return res.status(400).json({ message: 'Invalid action' });
    }

    const result = await Feedback.updateMany(
      { _id: { $in: feedbackIds }, isActive: true },
      { $set: updateQuery }
    );

    res.status(200).json({
      message,
      updated: result.modifiedCount,
      total: feedbackIds.length
    });

  } catch (error) {
    console.error('Bulk update feedback error:', error);
    res.status(500).json({ message: 'Server error. Please try again.' });
  }
};

// Export feedback data for analysis
const exportFeedback = async (req, res) => {
  try {
    const userRole = req.user.role;
    
    if (userRole !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin privileges required.' });
    }

    const filter = req.query.filter || 'all';
    const dateRange = req.query.dateRange || 'all';
    const format = req.query.format || 'json'; // 'json' or 'csv'

    // Build query filters (similar to getAllFeedback)
    const query = { isActive: true };
    
    if (filter !== 'all') {
      query.sentiment = filter;
    }
    
    if (dateRange !== 'all') {
      const now = new Date();
      let startDate;
      
      switch (dateRange) {
        case 'today':
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          break;
        case 'week':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
      }
      
      if (startDate) {
        query.createdAt = { $gte: startDate };
      }
    }

    const feedback = await Feedback.find(query)
      .populate('user', 'firstName lastName email')
      .sort({ createdAt: -1 });

    if (format === 'csv') {
      // Convert to CSV format
      const csvHeader = 'ID,User Name,Email,Feedback,Sentiment,Confidence,Created At\n';
      const csvData = feedback.map(item => {
        const userName = `${item.user?.firstName || ''} ${item.user?.lastName || ''}`.trim();
        const email = item.user?.email || '';
        const feedbackText = `"${item.feedback.replace(/"/g, '""')}"`;
        const createdAt = item.createdAt.toISOString();
        
        return `${item._id},${userName},${email},${feedbackText},${item.sentiment},${item.confidence},${createdAt}`;
      }).join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="feedback_export_${Date.now()}.csv"`);
      res.send(csvHeader + csvData);
    } else {
      // JSON format
      res.status(200).json({
        exportDate: new Date().toISOString(),
        totalRecords: feedback.length,
        filters: { sentiment: filter, dateRange },
        data: feedback
      });
    }

  } catch (error) {
    console.error('Export feedback error:', error);
    res.status(500).json({ message: 'Server error. Please try again.' });
  }
};

module.exports = {
  submitFeedback,
  getAllFeedback,
  getFeedbackStats,
  getSentimentTrends,
  getUserFeedback,
  deleteFeedback,
  bulkUpdateFeedback,
  exportFeedback
};
