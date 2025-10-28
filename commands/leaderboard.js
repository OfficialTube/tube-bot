const { SlashCommandBuilder } = require("discord.js");
const User = require("../models/User");
const { logOffline } = require("../utils/logger");

function formatNumber(n)
{
  if (n >= 10_000)
  {
    return (n / 1_000).toFixed(3).replace(/\.?0+$/, "") + "k";
  } 
  else
  {
    return n.toLocaleString();
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("Check the top users on the leaderboard!"),

  async execute(interaction) {
    try {
      await interaction.deferReply();

      const targetUser = interaction.options.getUser("user") || interaction.user;
      const userId = targetUser.id;
      const guildId = interaction.guild.id;

      const user = await User.findOne({ userId, guildId });

      const allUsers = await User.find({guildId}).sort({totalxp: -1});
      const rank = allUsers.findIndex(u => u.userId === userId) + 1;
      const totalUsers = allUsers.length;

      const top5all = allUsers.slice(0, 5);

      const allWeeklyUsers = await User.find({guildId, weeklyxp: { $gt: 0 } }).sort({weeklyxp: -1});
      const weeklyRank = allWeeklyUsers.findIndex(u => u.userId === userId) + 1;
      const totalWeeklyUsers = allWeeklyUsers.length;

      const top5weekly = allWeeklyUsers.slice(0, 5);

      let leaderboardTextAll = `# **__Top 5 Leaderboard: All Time__**\n\n`;
      let leaderboardTextWeekly =  `\n# **__Top 5 Leaderboard: This Week__**\n\n`;

      for (let i = 0; i < top5all.length; i++) {
        const u = top5all[i];
        const position = i + 1;
      
        const username = (await interaction.client.users.fetch(u.userId)).username.replace(/([*_`~|\\])/g, '\\$1');
        const xp = formatNumber(u.totalxp);
      
        const isSender = u.userId === userId;
        const line = isSender
          ? `**${position}\\. ${username} — ${xp} XP**\n`
          : `${position}\\. ${username} — ${xp} XP\n`;
        
        leaderboardTextAll += line;
      }
      
      if (rank > 5) {
        const username = (await interaction.client.users.fetch(userId)).username;
        const xp = formatNumber(user.totalxp);
        leaderboardTextAll += `**${rank}\\. ${username} — ${xp} XP**`;
      }

      for (let i = 0; i < top5weekly.length; i++) {
        const u = top5weekly[i];
        const position = i + 1;
      
        const username = (await interaction.client.users.fetch(u.userId)).username.replace(/([*_`~|\\])/g, '\\$1');
        const weeklyxp = formatNumber(u.weeklyxp);
      
        const isSender = u.userId === userId;
        const line = isSender
          ? `**${position}\\. ${username} — ${weeklyxp} XP**\n`
          : `${position}\\. ${username} — ${weeklyxp} XP\n`;
        
        leaderboardTextAll += line;
      }
      
      if (weeklyRank > 5) {
        const username = (await interaction.client.users.fetch(userId)).username;
        const weeklyxp = formatNumber(user.weeklyxp);
        leaderboardTextWeekly += `**${weeklyRank}\\. ${username} — ${weeklyxp} XP**`;
      }

      let leaderboardText = leaderboardTextAll + leaderboardTextWeekly;

      return interaction.editReply({
        content: leaderboardText 
      });

    } catch (err) {
      console.error("❌ MongoDB Error in /leaderboard:", err);
      logOffline("MongoDB Error in /leaderboard: leaderboard.js");

      if (interaction.deferred || interaction.replied) {
        return interaction.editReply({
          content: "⚠️ I couldn't connect to the database. Please try again later.",
        }).catch(console.error);
        logOffline("I couldn't connect to the database: leaderboard.js");
      } else {
        return interaction.reply({
          content: "⚠️ I couldn't connect to the database. Please try again later.",
          ephemeral: true,
        }).catch(console.error);
        logOffline("I couldn't connect to the database: leaderboard.js");
      }
    }
  },
};