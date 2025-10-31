const mongoose = require('mongoose');

const queueSchema = new mongoose.Schema({
    difficulty: { type: String, required: true },
    players: [{
        id: String,
        username: String,
        joinedAt: { type: Date, default: Date.now }
    }],
    isFull: {type: Boolean, default: false},
    createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('ViewerQueue', queueSchema);