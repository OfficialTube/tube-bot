const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  userId: String,
  guildId: String,
  xp: { type: Number, default: 0 },
  pxp: {type: Number, default: 0},
  level: { type: Number, default: 0 },
  levelxp: { type: Number, default: 10},
  totalxp: {type: Number, default: 0},
  lastmsg: {type: Number, default: 0},
  weeklyxp: {type: Number, default: 0},
  money: {type: Number, default: 0},
  wins: {type: Number, default: 0},
  blackjacks: {type: Number, default: 0},
  losses: {type: Number, default: 0},
  ties: {type: Number, default: 0},
  rounds: {type: Number, default: 0},
  moneyLost: {type: Number, default: 0},
  moneyGained: {type: Number, default: 0},
  moneyNet: {type: Number, default: 0},
  streakCurrent: {type: Number, default: 0},
  streakBest: {type: Number, default: 0},
  points: {type: Number, default: 0},
});

module.exports = mongoose.model("User", userSchema);
