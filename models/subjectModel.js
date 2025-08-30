const mongoose = require('mongoose');

const subjectSchema = new mongoose.Schema(
  {
    name: { 
      type: String, 
      required: true, 
      trim: true 
    },
    level: { 
      type: String, 
      required: true,
      enum: ['Scholarship', 'O/L', 'A/L'],
      index: true
    },
    quizCount: {
      type: Number,
      default: 0
    },
    description: {
      type: String,
      trim: true
    },
    isActive: {
      type: Boolean,
      default: true
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      required: true
    }
  },
  { timestamps: true }
);

// Compound index for faster queries by name and level
subjectSchema.index({ name: 1, level: 1 }, { unique: true });

const Subject = mongoose.model('Subject', subjectSchema);
module.exports = Subject;