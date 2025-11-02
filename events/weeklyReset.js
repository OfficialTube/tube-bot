const cron = require('node-cron');
const User = require('../models/User');
const { logOffline } = require('../utils/logger');

const GUILD_ID = '1334736733337686058';
const MOD_ROLE_ID = '1379719761075900468';
const YAPPER_ROLE_ID = '1432793828334632981';
const LOG_CHANNEL_ID = '1379723391417978930';

module.exports = (client) => {
  cron.schedule(
    '38 0 * * 0', // Runs Sundays 00:20 UTC (8:20 PM Saturday Eastern)
    async () => {
      try {
        const guild = await client.guilds.fetch(GUILD_ID);

        // 1️⃣ Fetch top users first
        const allUsers = await User.find({ weeklyxp: { $gt: 0 } }).sort({ weeklyxp: -1 });

        // 2️⃣ Fetch only relevant members (avoid timeout)
        const members = new Map();
        for (const userData of allUsers) {
          try {
            const member = await guild.members.fetch(userData.userId);
            members.set(userData.userId, member);
          } catch {
            // user left or can’t be fetched — skip
          }
        }

        // 3️⃣ Determine top 3 users (excluding mods)
        const topUsers = [];
        for (const userData of allUsers) {
          const member = members.get(userData.userId);
          if (!member) continue;
          if (!member.roles.cache.has(MOD_ROLE_ID)) topUsers.push({ member, userData });
          if (topUsers.length === 3) break;
        }

        // 4️⃣ Remove previous Yapper roles
        for (const member of members.values()) {
          if (member.roles.cache.has(YAPPER_ROLE_ID)) {
            await member.roles.remove(YAPPER_ROLE_ID).catch(() => {});
          }
        }

        const rewardInfo = [];

        // 5️⃣ Reward new Yappers
        for (let i = 0; i < topUsers.length; i++) {
          const { member, userData } = topUsers[i];
          await member.roles.add(YAPPER_ROLE_ID).catch(() => {});

          const user = await User.findOne({ userId: userData.userId, guildId: GUILD_ID });
          if (!user) continue;

          const weeklyVisible = Math.floor(user.weeklyxp || 0);

          let bonusPxp = 0;
          if (i === 0) bonusPxp = weeklyVisible;
          else if (i === 1) bonusPxp = Math.floor(weeklyVisible / 2);
          else if (i === 2) bonusPxp = Math.floor(weeklyVisible / 5);

          user.pxp = (user.pxp || 0) + bonusPxp;
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

        // 6️⃣ Reset weekly XP for all users
        await User.updateMany({ guildId: GUILD_ID }, { $set: { weeklyxp: 0 } });

        // 7️⃣ Send log message
        const channel = guild.channels.cache.get(LOG_CHANNEL_ID);
        if (channel) {
          if (rewardInfo.length) {
            const messageLines = rewardInfo.map((info) => {
              const weeklyStr = info.weeklyVisible.toLocaleString();
              const bonusStr = info.visibleBonus.toLocaleString();
              return `**${info.place}\\.** ${info.tag} — ${weeklyStr} XP (+${bonusStr} Bonus XP)`;
            });
            await channel.send(
              `# Yappers of the Week\n\n${messageLines.join(
                '\n'
              )}\n\nWeekly XP has been reset and rewards have been distributed!`
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
    },
    {
      timezone: 'Etc/UTC', // ensure UTC time
    }
  );

  console.log('✅ Weekly reset cron job initialized!');
};
