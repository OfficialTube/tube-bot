const User = require("./models/User");
const { logOffline } = require("./index.js");
const { getMultiplier } = require("./utils/multiplier");

async function handleMessageXP(message) {
  if (message.author.bot || !message.guild) {
    return { user: null, leveledUp: false };
  }

  try {
    let user = await User.findOne({ userId: message.author.id, guildId: message.guild.id });

    if (!user) {
      user = new User({
        userId: message.author.id,
        guildId: message.guild.id,
        xp: 0,
        pxp: 0,
        level: 0,
        levelxp: 10,
        totalxp: 0,
        lastmsg: 0,
        weeklyxp: 0,
        money: 0,
        wins: 0,
        blackjacks: 0,
        losses: 0,
        ties: 0,
        rounds: 0,
        moneyLost: 0,
        moneyGained: 0,
        moneyNet: 0,
        streakCurrent: 0,
        streakBest: 0,
        points: 0,
      });
    }

    let now = Date.now();
    const cooldown = 12000;

    if (user.lastmsg && now - user.lastmsg < cooldown)
    {
      return {user, leveledUp: false};
    }

    user.lastmsg = now;

    const xpmultiplier = await getMultiplier(message.author, message.guild, message.client);

    let gain = 10 * xpmultiplier;
    user.pxp += gain;

    while (user.pxp >= 10)
    {
      user.pxp -= 10;
      user.xp++
      user.totalxp++;
      user.weeklyxp++;
      user.money++;
    }

    let leveledUp = false;
    while (user.xp >= user.levelxp) {
      user.xp -= user.levelxp;
      user.level++;
      user.money += (user.level * 10);
      user.levelxp += user.level;
      leveledUp = true;
    }

    await user.save();
    return { user, leveledUp };

  } catch (err) {
    console.error("❌ XP handling failed:", err);
    logOffline("❌ XP handling failed: levels.js");
    return { user: null, leveledUp: false }; 
  }
}

module.exports = {
  handleMessageXP,
};

