const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  userId: String,
  guildId: String,
  xp: { type: Number, default: 0 },
  pxp: {type: Number, default: 0},
  level: { type: Number, default: 0 },
  levelxp: { type: Number, default: 10},
  totalxp: {type: Number, default: 0},
  lastmsg: {type: Number, default: 0}
});

module.exports = mongoose.model("User", userSchema);
