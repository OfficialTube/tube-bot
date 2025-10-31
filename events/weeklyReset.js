const cron = require('node-cron');
const User = require('../models/User');
const { logOffline } = require('../utils/logger');

const GUILD_ID = '1334736733337686058';
const MOD_ROLE_ID = '1379719761075900468';
const YAPPER_ROLE_ID = '1432793828334632981';
const LOG_CHANNEL_ID = '1379723391417978930';

module.exports = (client) => {
  cron.schedule('5 0 * * 0', async () => {
    try {
      const guild = await client.guilds.fetch(GUILD_ID);
      const members = await guild.members.fetch();

      const allUsers = await User.find({ weeklyxp: { $gt: 0 } })
        .sort({ weeklyxp: -1 });

      const topUsers = [];

      for (const userData of allUsers) {
        const member = members.get(userData.userId);
        if (!member) continue;
        if (!member.roles.cache.has(MOD_ROLE_ID)) topUsers.push({ member, userData });
        if (topUsers.length === 3) break;
      }

      for (const member of members.values()) {
        if (member.roles.cache.has(YAPPER_ROLE_ID)) {
          await member.roles.remove(YAPPER_ROLE_ID).catch(() => {});
        }
      }

      const rewardInfo = [];

      for (let i = 0; i < topUsers.length; i++) {
        const { member, userData } = topUsers[i];
        await member.roles.add(YAPPER_ROLE_ID).catch(() => {});

        const user = await User.findOne({ userId: userData.userId, guildId: GUILD_ID });
        if (!user) continue;

        const weeklyVisible = Math.floor(user.weeklyxp || 0);

        let bonusPxp = 0;
        if (i === 0) {
          bonusPxp = weeklyVisible;
        } else if (i === 1) {
          bonusPxp = Math.floor(weeklyVisible / 2);
        } else if (i === 2) {
          bonusPxp = Math.floor(weeklyVisible / 5);
        }
        async function handleMessageXP(message) {
          if (message.author.bot || !message.guild) {
            return { user: null, leveledUp: false };
          }
          user.pxp = (user.pxp || 0) + bonusPxp;
          while (user.pxp >= 10)
          {
            user.pxp -= 10;
            user.xp++
            user.totalxp++;
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
        }
        const visibleBonus = Math.floor(bonusPxp / 10);

        user.weeklyxp = 0;

        await user.save();

        rewardInfo.push({
          place: i + 1,
          tag: member.user.tag,
          weeklyVisible,
          bonusPxp,
          visibleBonus,
        });
      }

      await User.updateMany({ guildId: GUILD_ID }, { $set: { weeklyxp: 0 } });

      const channel = guild.channels.cache.get(LOG_CHANNEL_ID);
      if (channel) {
        if (rewardInfo.length) {
          const messageLines = rewardInfo.map(info => {
            const weeklyStr = info.weeklyVisible.toLocaleString();
            const bonusStr = info.visibleBonus.toLocaleString();
            return `**${info.place}\\.** ${info.tag} — ${weeklyStr} XP (+${bonusStr} Bonus XP)`;
          });
          await channel.send(
            `# Yappers of the Week\n\n${messageLines.join('\n')}\n\nWeekly XP has been reset and rewards have been distributed!`
          );
        } else {
          await channel.send('No eligible yappers this week.');
        }
      }

      logOffline('✅ Weekly XP reset complete, bonuses applied!');
    } catch (err) {
      logOffline('❌ Weekly reset failed!');
      console.error('Weekly reset failed:', err);
    }
  });
};

module.exports = {
  handleMessageXP,
};