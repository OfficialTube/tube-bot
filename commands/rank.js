const { SlashCommandBuilder } = require("discord.js");
const User = require("../models/User");
const { logOffline } = require("../utils/logger");
const { getMultiplier } = require("../utils/multiplier");

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
    .setName("rank")
    .setDescription("Check your current level and XP")
    .addUserOption(option =>
      option
                   .setName("user")
                   .setDescription("The user whose rank you want to check")
                   .setRequired(false)
    ),

  async execute(interaction) {
    try {
      await interaction.deferReply();

      const targetUser = interaction.options.getUser("user") || interaction.user;
      const userId = targetUser.id;
      const guildId = interaction.guild.id;

      const user = await User.findOne({ userId, guildId });

      if (targetUser.bot)
      {
        return interaction.editReply({
          content: `**${targetUser.tag.replace(/([*_`~|\\])/g, '\\$1')}** is a bot. Bots cannot earn XP.`,
        });
      }

      if (!user) {
        return interaction.editReply({
          content: `**${targetUser.tag.replace(/([*_`~|\\])/g, '\\$1')} doesn't have any XP yet! Start chatting to earn some.**`,
        });
      }

      const allUsers = await User.find({guildId}).sort({totalxp: -1});
      const rank = allUsers.findIndex(u => u.userId === userId) + 1;
      const totalUsers = allUsers.length;
      const xpmultiplier = await getMultiplier(targetUser, interaction.guild, interaction.client);

      return interaction.editReply({
        content: `**${targetUser.tag.replace(/([*_`~|\\])/g, '\\$1')}'s Rank**\nRank: ${formatNumber(rank)} of ${formatNumber(totalUsers)}\nLevel: ${user.level}\nXP: ${formatNumber(user.xp)}/${formatNumber(user.levelxp)}\nMultiplier: ${xpmultiplier}x\nTotal XP: ${formatNumber(user.totalxp)}`,
      });

    } catch (err) {
      console.error("❌ MongoDB Error in /rank:", err);
      logOffline("MongoDB Error in /rank: rank.js");

      if (interaction.deferred || interaction.replied) {
        return interaction.editReply({
          content: "⚠️ I couldn't connect to the database. Please try again later.",
        }).catch(console.error);
        logOffline("I couldn't Connect to the Database: rank.js");
      } else {
        return interaction.reply({
          content: "⚠️ I couldn't connect to the database. Please try again later.",
          ephemeral: true,
        }).catch(console.error);
        logOffline("I couldn't connect to the database: rank.js");
      }
    }
  },
};




