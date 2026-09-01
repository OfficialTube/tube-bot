const mongoose = require('mongoose');

const queueScheduleSchema = new mongoose.Schema({
    epoch: { type: Number, required: true },
    targetSendTime: { type: Date, required: true },
    isDeployed: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('QueueSchedule', queueScheduleSchema);
