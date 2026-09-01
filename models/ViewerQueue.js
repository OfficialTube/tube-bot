const mongoose = require('mongoose');

const queueSchema = new mongoose.Schema({
    difficulty: { type: String, required: true },
    players: [{ 
        id: String, 
        username: String, 
        joinedAt: { type: Date, default: Date.now } 
    }],
    isFull: { type: Boolean, default: false },
    filledAt: { type: Date, default: null }, // Required for sorting full groups chronologically
    
    // Live Admin Flow Tracking States
    status: { type: String, default: 'waiting' }, // 'waiting', 'setup', 'game1', 'midgame', 'game2', 'outro', 'completed'
    
    // Manual Log Timestamps (Saved for post-stream event evaluation)
    timeSetupStart: { type: Date, default: null },
    timeGame1Start: { type: Date, default: null },
    timeGame1End: { type: Date, default: null },
    timeGame2Start: { type: Date, default: null },
    timeGame2End: { type: Date, default: null },
    timeOutroEnd: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('ViewerQueue', queueSchema);
