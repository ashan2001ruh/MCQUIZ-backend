const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  feedback: {
    type: String,
    required: true,
    trim: true
  },
  sentiment: {
    type: String,
    enum: ['positive', 'negative'],
    required: true
  },
  confidence: {
    type: Number,
    min: 0,
    max: 1,
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  reviewed: {
    type: Boolean,
    default: false
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  reviewedAt: {
    type: Date
  },
  addressed: {
    type: Boolean,
    default: false
  },
  addressedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  addressedAt: {
    type: Date
  },
  response: {
    type: String,
    trim: true
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high'],
    default: 'medium'
  },
  category: {
    type: String,
    enum: ['general', 'bug', 'feature_request', 'usability', 'content', 'performance'],
    default: 'general'
  }
}, { timestamps: true });

// Index for faster queries
feedbackSchema.index({ user: 1, createdAt: -1 });
feedbackSchema.index({ sentiment: 1, createdAt: -1 });

const Feedback = mongoose.model('Feedback', feedbackSchema);

module.exports = Feedback;
