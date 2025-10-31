const { SlashCommandBuilder } = require("discord.js");
const User = require("../models/User");
const { logOffline } = require("../utils/logger");

function formatNumber(n)
{
  if (n == null || isNaN(n)) return "0";
  if (n >= 10_000)
  {
    return (n / 1_000).toFixed(3).replace(/\.?0+$/, "") + "k";
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
    return "$" + n.toLocaleString();
  }
}

function formatMoneyNet(x, y)
{
    let netMoney = x - y;
    if(netMoney > 0)
    {
        return "+$" + netMoney.toLocaleString();
    } else if(netMoney < 0)
    {
        netMoney -= (netMoney * 2);
        return "-$" + netMoney.toLocaleString();
    } else
    { 
        return "$" + netMoney.toLocaleString();
    }
}

function moneyPerRound(x, y)
{
    let n = Math.round(x / y).toFixed(2);
    if(n > 0)
    {
        return "+$" + n.toLocaleString();
    } else if(n < 0)
    {
        n -= (n * 2);
        return "-$" + n.toLocaleString();
    } else
    { 
        return "$" + n.toLocaleString();
    }
}

function formatPercent(x, y)
{
    return (Math.round((x / y) * 10_000) / 100).toFixed(2) + "%";
}

function pointsPerRound(x, y)
{
    return Math.round((x / y)).toFixed(3) + " Points Per Round";
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("blackjackstats")
        .setDescription("Check your Blackjack statistics!")
        .addUserOption(option =>
            option
                .setName("user")
                .setDescription("Check the Blackjack statistics for a certain user.")
                .setRequired(false)
        ),
    async execute(interaction) {
        try {
            await interaction.deferReply();

            const targetUser = interaction.options.getUser('user') || interaction.user;
            const userId = targetUser.id;
            const guildId = interaction.guild.id;

            const user = await User.findOne({userId, guildId});

            if(targetUser.bot)
            {
                return interaction.editReply({
                    content: `**${targetUser.tag.replace(/([*_`~|\\])/g, '\\$1')}** is a bot. Bots cannot play Blackjack.`,
                });
            }

            if(!user)
            {
                return interaction.editReply({
                    content: `**${targetUser.tag.replace(/([*_`~|\\])/g, '\\$1')} hasn't chatted in the server yet!**`,
                });
            }
            const allBlackjackUsers = await User.find({guildId, rounds: { $gt: 0 } }).sort({points: -1});
            const blackjackPoints = allBlackjackUsers.findIndex(u => u.userId === userId) + 1;
            const totalBlackjackUsers = allBlackjackUsers.length;
            let blackjackPointsDisplay;
            if (!blackjackPoints)
            {
                blackjackPointsDisplay = 'Rank: Unranked';
            } else
            {
                blackjackPointsDisplay = `Rank: ${formatNumber(blackjackPoints)} of ${formatNumber(totalBlackjackUsers)}`;
            }

            return interaction.editReply({
                content: `**__${targetUser.tag.replace(/([*_`~|\\])/g, '\\$1')}'s Blackjack Stats__**\nPoints: ${formatNumber(user.points)}\n${blackjackPointsDisplay}\n\nRounds: ${formatNumber(user.rounds)}\nWins: ${formatNumber(user.wins)} (${formatPercent(user.wins, user.rounds)})\nBlackjacks: ${formatNumber(user.blackjacks)} (${formatPercent(user.blackjacks, user.wins)} of Wins) (${formatPercent(user.blackjacks, user.rounds)} of Total)\nTies: ${formatNumber(user.ties)} (${formatPercent(user.ties, user.rounds)})\nLost: ${formatNumber(user.losses)} (${formatPercent(user.losses, user.rounds)})\nAverage Points Per Round: ${pointsPerRound(user.points, user.rounds)}\n\nMoney Earned: ${formatMoney(user.moneyGained)}\nMoney Lost: ${formatMoney(user.moneyLost)}\nNet Money: ${formatMoneyNet(user.moneyGained, user.moneyLost)}\nAverage Money Per Round: ${moneyPerRound(user.moneyNet, user.rounds)}\n\nCurrent Streak: ${user.streakCurrent}\nBest Streak: ${user.streakBest}`
            });

        } catch (err)
        {
            console.error("Error in /blackjackStats.js: ", err);
        }
            
    },
};