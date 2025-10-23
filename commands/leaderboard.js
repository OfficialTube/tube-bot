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
    .setDescription("Check the top 10 users on the leaderboard!"),

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

      const top10 = allUsers.slice(0, 10);

      let leaderboardText = `# **__Top 10 Leaderboard__**\n\n`;

      for (let i = 0; i < top10.length; i++) {
        const u = top10[i];
        const position = i + 1;
      
        const username = (await interaction.client.users.fetch(u.userId)).username.replace(/([*_`~|\\])/g, '\\$1');
        const xp = formatNumber(u.totalxp);
      
        const isSender = u.userId === userId;
        const line = isSender
          ? `**${position}\\. ${username} — ${xp} XP**\n`
          : `${position}\\. ${username} — ${xp} XP\n`;
        
        leaderboardText += line;
      }
      
      if (rank > 10) {
        const username = (await interaction.client.users.fetch(userId)).username;
        const xp = formatNumber(user.totalxp);
        leaderboardText += `**${rank}\\. ${username} — ${xp} XP**`;
      }

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