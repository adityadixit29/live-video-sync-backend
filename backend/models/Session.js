const mongoose = require('mongoose');
const Counter = require('./Counter');

const sessionSchema = new mongoose.Schema({
  id: {
    type: Number,
    unique: true
  },
  type: {
    type: String,
    required: true,
    enum: ['admin', 'student']
  },
  unique_id: {
    type: String,
    required: true
  },
  userurl: {
    type: String,
    required: true
  }
}, {
  timestamps: true
});

// Create compound unique index on unique_id and type
// This allows same unique_id for admin and student, but prevents duplicates
sessionSchema.index({ unique_id: 1, type: 1 }, { unique: true });

// Auto-increment id using counter collection
sessionSchema.pre('save', async function(next) {
  if (this.isNew) {
    try {
      const counter = await Counter.findByIdAndUpdate(
        { _id: 'sessionId' },
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
      );
      this.id = counter.seq;
    } catch (error) {
      return next(error);
    }
  }
  next();
});

module.exports = mongoose.model('Session', sessionSchema);

