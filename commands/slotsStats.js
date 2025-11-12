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

function formatMoneyNet(x, y)
{
    let netMoney = x - y;
    return moneyFormatter.format(netMoney);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("slotsstats")
        .setDescription("Check your Slots statistics!")
        .addUserOption(option =>
            option
                .setName("user")
                .setDescription("Check the Slots statistics for a certain user.")
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
                    content: `**${targetUser.tag.replace(/([*_`~|\\])/g, '\\$1')}** is a bot. Bots cannot play Slots.`,
                });
            }

            if(!user)
            {
                return interaction.editReply({
                    content: `**${targetUser.tag.replace(/([*_`~|\\])/g, '\\$1')} hasn't chatted in the server yet!**`,
                });
            }
            const allSlotsUsers = await User.find({guildId, roundsSlots: { $gt: 0 } }).sort({moneyEarnedSlots: -1});
            const slotsMoney = allSlotsUsers.findIndex(u => u.userId === userId) + 1;
            const totalSlotsUsers = allSlotsUsers.length;
            let slotsMoneyDisplay;
            if (!slotsMoney)
            {
                slotsMoneyDisplay = 'Rank: Unranked';
            } else
            {
                slotsMoneyDisplay = `Rank: ${formatNumber(slotsMoney)} of ${formatNumber(totalSlotsUsers)}`;
            }

            return interaction.editReply({
                content: `**__${targetUser.tag.replace(/([*_`~|\\])/g, '\\$1')}'s Slots Stats__**\nMoney Earned: ${formatMoney(user.moneyEarnedSlots)}\n${slotsMoneyDisplay}\nRounds: ${formatNumber(user.roundsSlots)}\n\nDoubles:\n:1: - ${formatNumber(user.double1)}\n:2: - ${formatNumber(user.double2)}\n:3: - ${formatNumber(user.double3)}\n:4: - ${formatNumber(user.double4)}\n:5: - ${formatNumber(user.double5)}\n:6: - ${formatNumber(user.double6)}\n:7: - ${formatNumber(user.double7)}\n:8: - ${formatNumber(user.double8)}\n:9: - ${formatNumber(user.double9)}\n\nTriples:\n:1: - ${formatNumber(user.triple1)}\n:2: - ${formatNumber(user.triple2)}\n:3: - ${formatNumber(user.triple3)}\n:4: - ${formatNumber(user.triple4)}\n:5: - ${formatNumber(user.triple5)}\n:6: - ${formatNumber(user.triple6)}\n:7: - ${formatNumber(user.triple7)}\n:8: - ${formatNumber(user.triple8)}\n:9: - ${formatNumber(user.triple9)}\n\nMoney Earned: ${formatMoney(user.moneyEarnedSlots)}\nMoney Spent: ${formatMoney(user.moneySpentSlots)}\nNet Money: ${formatMoneyNet(user.moneyEarnedSlots, user.moneySpentSlots)}\n\nMax Money Won: ${formatMoney(user.maxWon)}`
            });

        } catch (err)
        {
            console.error("Error in /slotsStats.js: ", err);
        }
            
    },
};