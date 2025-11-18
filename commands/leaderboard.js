const { SlashCommandBuilder } = require("discord.js");
const User = require("../models/User");
const { logOffline } = require("../utils/logger");

const moneyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatNumber(n)
{
  if (n == null || isNaN(n)) return "0";
  if (n >= 100_000)
  {
    return (n / 1_000).toFixed(1).replace(/\.?0+$/, "") + "k";
  }
  else if (n >= 10_000)
  {
    return (n/1_000).toFixed(2).replace(/\.?0+$/, "") + "k";
  } 
  else
  {
    return n.toLocaleString();
  }
}

function formatMoney(n)
{
  if (n == null || isNaN(n)) return "$0";
  else
  {
    return moneyFormatter.format(n);
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("Check the top users on the leaderboard!")
    .addStringOption(option =>
      option
        .setName("type")
        .setDescription("Choose which leaderboard to view")
        .setRequired(false)
        .addChoices(
          { name: "All Time", value: "total" },
          { name: "This Week", value: "week"},
          { name: "Blackjack", value: "blackjack"},
          { name: "Slots", value: "slots"}
        )
    ),

  async execute(interaction) {
    try {
      await interaction.deferReply();

      const type = interaction.options.getString("type");
      const targetUser = interaction.options.getUser("user") || interaction.user;
      const userId = targetUser.id;
      const guildId = interaction.guild.id;

      const user = await User.findOne({ userId, guildId });

      const allUsers = await User.find({guildId}).sort({totalxp: -1});
      const allWeeklyUsers = await User.find({guildId, weeklyxp: { $gt: 0 } }).sort({weeklyxp: -1});
      const allBlackjackUsers = await User.find({guildId, rounds: { $gt: 0 } }).sort({points: -1});
      const allSlotsUsers = await User.find({guildId, roundsSlots: { $gt: 0 }}).sort({moneyEarnedSlots: -1});
      
      const rank = allUsers.findIndex(u => u.userId === userId) + 1;
      const weeklyRank = allWeeklyUsers.findIndex(u => u.userId === userId) + 1;
      const blackjackPoints = allBlackjackUsers.findIndex(u => u.userId === userId) + 1;
      const slotsMoney = allSlotsUsers.findIndex(u => u.userId === userId) + 1;

      if (type === "total" || type === "week")
      {
        const isWeekly = type === "week";
        const users = isWeekly ? allWeeklyUsers : allUsers;
        const top10 = users.slice(0, 10);
        const categoryName = isWeekly ? "This Week" : "All Time";

        let leaderboardText = `## **__Top 10 - ${categoryName}__**\n\n`;

        for (let i = 0; i < top10.length; i++)
        {
          const u = top10[i];
          const username = (await interaction.client.users.fetch(u.userId)).username.replace(/([*_`~|\\])/g, '\\$1');
          const xp = formatNumber(isWeekly ? u.weeklyxp : u.totalxp);

          leaderboardText += `${i + 1}\\. ${u.userId === userId ? `**${username} | ${xp} XP**` : `${username} | ${xp} XP`}\n`
        }

        if (users.findIndex(u => u.userId === userId) >= 10)
        {
          const xp = formatNumber(isWeekly ? user.weeklyxp : user.totalxp);
          const r = isWeekly ? weeklyRank : rank;
          leaderboardText += `**${r}\\. ${targetUser.username} | ${xp} XP**`;
        }

        return interaction.editReply({content: leaderboardText });
      }
      if (type === "blackjack")
      {
        const isBlackjack = "blackjack";
        const users = isBlackjack ? allBlackjackUsers : null;
        const top10 = users.slice(0, 10);
        const categoryName = isBlackjack ? "Blackjack" : null;

        let leaderboardText = `## **__Top 10 - ${categoryName}__**\n\n`;

        for (let i = 0; i < top10.length; i++)
        {
          const u = top10[i];
          const username = (await interaction.client.users.fetch(u.userId)).username.replace(/([*_`~|\\])/g, '\\$1');
          const xp = formatNumber(isBlackjack ? u.points : null);

          leaderboardText += `${i + 1}\\. ${u.userId === userId ? `**${username} | ${xp} Points**` : `${username} | ${xp} Points`}\n`
        }

        if (users.findIndex(u => u.userId === userId) >= 10)
        {
          const xp = formatNumber(isBlackjack ? user.points : null);
          const r = isBlackjack ? blackjackPoints : null;
          leaderboardText += `**${r}\\. ${targetUser.username} | ${xp} Points**`;
        }

        return interaction.editReply({content: leaderboardText });
      }

      if (type === "slots")
      {
        const isSlots = "slots";
        const users = isSlots ? allSlotsUsers : null;
        const top10 = users.slice(0, 10);
        const categoryName = isSlots ? "Slots" : null;

        let leaderboardText = `## **__Top 10 - ${categoryName}__**\n\n`;

        for (let i = 0; i < top10.length; i++)
        {
          const u = top10[i];
          const username = (await interaction.client.users.fetch(u.userId)).username.replace(/([*_`~|\\])/g, '\\$1');
          const xp = formatMoney(isSlots ? u.moneyEarnedSlots : null);

          leaderboardText += `${i + 1}\\. ${u.userId === userId ? `**${username} | ${xp} Earned**` : `${username} | ${xp} Earned`}\n`
        }

        if (users.findIndex(u => u.userId === userId) >= 10)
        {
          const xp = formatMoney(isSlots ? user.moneyEarnedSlots : null);
          const r = isSlots ? slotsMoney : null;
          leaderboardText += `**${r}\\. ${targetUser.username} | ${xp} Earned**`;
        }

        return interaction.editReply({content: leaderboardText });
      }


      const totalUsers = allUsers.length;

      const top5all = allUsers.slice(0, 5);

      const totalWeeklyUsers = allWeeklyUsers.length;

      const top5weekly = allWeeklyUsers.slice(0, 5);

      const totalBlackjackUsers = allBlackjackUsers.length;
      const top5BlackjackUsers = allBlackjackUsers.slice(0, 5);

      const totalSlotsUsers = allSlotsUsers.length;
      const top5SlotsUsers = allSlotsUsers.slice(0, 5);

      let leaderboardTextAll = `## **__All Time__**\n\n`;
      let leaderboardTextWeekly =  `## **__This Week__**\n\n`;
      let leaderboardTextBlackjack = `## **__Blackjack__**\n\n`;
      let leaderboardTextSlots = `## **__Slots__**\n\n`;

      for (let i = 0; i < top5all.length; i++) {
        const u = top5all[i];
        const position = i + 1;
      
        const username = (await interaction.client.users.fetch(u.userId)).username.replace(/([*_`~|\\])/g, '\\$1');
        const xp = formatNumber(u.totalxp);
      
        const isSender = u.userId === userId;
        const line = isSender
          ? `**${position}\\. ${username} | ${xp} XP**\n`
          : `${position}\\. ${username} | ${xp} XP\n`;
        
        leaderboardTextAll += line;
      }
      
      if (rank > 5) {
        const username = (await interaction.client.users.fetch(userId)).username.replace(/([*_`~|\\])/g, '\\$1');
        const xp = formatNumber(user.totalxp);
        leaderboardTextAll += `**${rank}\\. ${username} | ${xp} XP**\n`;
      }

      for (let i = 0; i < top5weekly.length; i++) {
        const u = top5weekly[i];
        const position = i + 1;
      
        const username = (await interaction.client.users.fetch(u.userId)).username.replace(/([*_`~|\\])/g, '\\$1');
        const weeklyxp = formatNumber(u.weeklyxp);
      
        const isSender = u.userId === userId;
        const line = isSender
          ? `**${position}\\. ${username} | ${weeklyxp} XP**\n`
          : `${position}\\. ${username} | ${weeklyxp} XP\n`;
        
        leaderboardTextWeekly += line;
      }
      
      if (weeklyRank > 5) {
        const username = (await interaction.client.users.fetch(userId)).username.replace(/([*_`~|\\])/g, '\\$1');
        const weeklyxp = formatNumber(user.weeklyxp);
        leaderboardTextWeekly += `**${weeklyRank}\\. ${username} | ${weeklyxp} XP**\n`;
      }

      for (let i = 0; i < top5BlackjackUsers.length; i++) {
        const u = top5BlackjackUsers[i];
        const position = i + 1;
      
        const username = (await interaction.client.users.fetch(u.userId)).username.replace(/([*_`~|\\])/g, '\\$1');
        const points = formatNumber(u.points);
      
        const isSender = u.userId === userId;
        const line = isSender
          ? `**${position}\\. ${username} | ${points} Points**\n`
          : `${position}\\. ${username} | ${points} Points\n`;
        
        leaderboardTextBlackjack += line;
      }
      
      if (blackjackPoints > 5) {
        const username = (await interaction.client.users.fetch(userId)).username.replace(/([*_`~|\\])/g, '\\$1');
        const points = formatNumber(user.points);
        leaderboardTextBlackjack += `**${blackjackPoints}\\. ${username} | ${points} Points**\n`;
      }

      for (let i = 0; i < top5SlotsUsers.length; i++) {
        const u = top5SlotsUsers[i];
        const position = i + 1;
      
        const username = (await interaction.client.users.fetch(u.userId)).username.replace(/([*_`~|\\])/g, '\\$1');
        const moneyEarned = formatMoney(u.moneyEarnedSlots);
      
        const isSender = u.userId === userId;
        const line = isSender
          ? `**${position}\\. ${username} | ${moneyEarned} Earned**\n`
          : `${position}\\. ${username} | ${moneyEarned} Earned\n`;
        
        leaderboardTextSlots += line;
      }
      
      if (slotsMoney > 5) {
        const username = (await interaction.client.users.fetch(userId)).username.replace(/([*_`~|\\])/g, '\\$1');
        const moneyEarned = formatMoney(user.moneyEarnedSlots);
        leaderboardTextSlots += `**${slotsMoney}\\. ${username} | ${moneyEarned} Earned**`;
      }

      let leaderboardText = '# Top 5 Leaderboards\n' + leaderboardTextAll + leaderboardTextWeekly + leaderboardTextBlackjack + leaderboardTextSlots;

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