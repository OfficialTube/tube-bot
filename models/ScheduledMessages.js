const mongoose = require('mongoose');

const ScheduledMessageSchema = new mongoose.Schema({
    runAt: {type: Date, required: true},
    channelId: {type: String, required: true},
    content: {type: String, required: true},
    sent: {type: Boolean, default: false},
});

ScheduledMessageSchema.index({ runAt: 1, sent: 1});

module.exports = mongoose.model('ScheduledMessage', ScheduledMessageSchema);