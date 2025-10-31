const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");
const User = require("../models/User");

const Colors = {
    PLAYER: 0x3498db,     // Blue
    DEALER: 0x95a5a6,     // Grey
    WIN: 0x2ecc71,        // Green
    LOSE: 0xe74c3c,       // Red
    BLACKJACK: 0xf1c40f   // Gold
};

const suits = ["♠", "♥", "♦", "♣"];
const values = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];

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
        netMoney += (netMoney * 2);
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
        n += (n * 2);
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
    return Math.round(x / y).toFixed(3) + " Points Per Round";
}

function createDeck() {
    const deck = [];
    for (const suit of suits) for (const value of values) deck.push({ suit, value });
    return deck;
}

function drawCard(deck) {
    const index = Math.floor(Math.random() * deck.length);
    return deck.splice(index, 1)[0];
}

function handValue(hand) {
    let total = 0, aces = 0;
    for (const card of hand) {
        if (["J","Q","K"].includes(card.value)) total += 10;
        else if (card.value === "A") { total += 11; aces++; }
        else total += parseInt(card.value);
    }
    while (total > 21 && aces > 0) { total -= 10; aces--; }
    return total;
}

function handToString(hand, hideSecond=false) {
    return hand.map((c,i)=> hideSecond && i===1 ? "[Hidden]" : `${c.value}${c.suit}`).join(" ");
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

module.exports = {
    data: new SlashCommandBuilder()
        .setName("blackjack")
        .setDescription("Play a game of blackjack!")
        .addStringOption(option =>
        option
            .setName("stats")
            .setDescription("Check your Blackjack statistics.")
        )
        .addUserOption(option =>
            option
                .setName("user")
                .setDescription("Check the Blackjack statistics for a certain user.")
                .setRequired(false)
        ),
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand(false);

        if (subcommand === 'stats')
        {
            const user = interaction.options.getUser('user') || interaction.user;

            const stats = await User.findOne({userId: user.id});

            if(!stats)
            {
                return interaction.reply({
                    content: `${user.username} has no stats yet.`,
                    ephemeral: true
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

            return interaction.reply({
                content: `**__${user.username}'s Blackjack Stats__**\nPoints: ${formatNumber(user.points)}\n${blackjackPointsDisplay}\n\nRounds: ${formatNumber(user.rounds)}\nWon: ${formatNumber(user.wins)} (${formatPercent(user.wins, user.rounds)})\nBlackjacks: ${formatNumber(user.blackjacks)} (${formatPercent(user.blackjacks, user.wins)} of Wins) (${formatPercent(user.blackjacks, user.rounds)} of Total)\nTies: ${formatNumber(user.ties)} (${formatPercent(user.ties, user.rounds)})\nLost: ${formatNumber(user.losses)} (${formatPercent(user.losses, user.rounds)})\nAverage Points Per Round: ${pointsPerRound(user.points, user.rounds)}\n\nMoney Earned: ${formatMoney(user.moneyGained)}\nMoney Lost: ${formatMoney(user.moneyLost)}\nNet Money: ${formatMoneyNet(user.moneyGained, user.moneyLost)}\nAverage Money Per Round: ${moneyPerRound(user.netMoney, user.rounds)}\n\nCurrent Streak: ${user.streakCurrent}\nBest Streak: ${user.streakBest}`
            });
        }

        let user = await User.findOne({ userId: interaction.user.id });

        if (!user || user.money < 10)
        {
            return interaction.reply({
                content: `You do not have enough money to play Blackjack! You need at least $10! Chat to earn money. You can check how much money you have by typing \`/rank\`.`,
                ephemeral: true
            })
        }
        const deck = createDeck();
        const playerHand = [drawCard(deck), drawCard(deck)];
        const dealerHand = [drawCard(deck), drawCard(deck)];

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder().setCustomId("hit").setLabel("Hit").setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId("stand").setLabel("Stand").setStyle(ButtonStyle.Danger)
            );

        const embed = new EmbedBuilder()
            .setTitle("🃏 Blackjack")
            .setDescription(
                `**Your hand:** ${handToString(playerHand)} (**${handValue(playerHand)}**)\n`+
                `**Dealer:** ${handToString(dealerHand,true)}`
            )
            .setColor(Colors.PLAYER);

        await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });

        const collector = interaction.channel.createMessageComponentCollector({
            filter: i => i.user.id === interaction.user.id,
            time: 120000
        });

        let streak = user.streakCurrent || 0;

        collector.on("collect", async i => {
            if (i.customId === "hit") {
                playerHand.push(drawCard(deck));
                const total = handValue(playerHand);

                if (total > 21) {
                    collector.stop();
                    await i.update({
                        embeds: [new EmbedBuilder()
                            .setTitle("💥 Bust!")
                            .setDescription(`Your hand: ${handToString(playerHand)} (**${total}**) — You lose!\nMoney: -$10\nPoints: -1`)
                            .setColor(Colors.LOSE)],
                        components: []
                    });
                    user.money -= 10;
                    user.losses++;
                    user.rounds++;
                    user.moneyLost += 10;
                    user.moneyNet = user.moneyGained-user.moneyLost;
                    user.streakCurrent = 0;
                    user.points--;
                    await user.save();
                } else {
                    await i.update({
                        embeds: [new EmbedBuilder()
                            .setTitle("🃏 Blackjack")
                            .setDescription(
                                `**Your hand:** ${handToString(playerHand)} (**${total}**)\n` +
                                `**Dealer:** ${handToString(dealerHand,true)}`
                            )
                            .setColor(Colors.PLAYER)],
                        components: [row]
                    });
                }
            } else if (i.customId === "stand") {
                collector.stop();

                // Dealer's turn
                await i.update({
                    embeds: [new EmbedBuilder()
                        .setTitle("🃏 Dealer's Turn")
                        .setDescription(
                            `**Your hand:** ${handToString(playerHand)} (**${handValue(playerHand)}**)\n` +
                            `**Dealer:** ${handToString([dealerHand[0]], true)}`
                        )
                        .setColor(Colors.DEALER)],
                    components: []
                });

                while(handValue(dealerHand) < 17) {
                    await sleep(1000); // 1-second pause per card
                    dealerHand.push(drawCard(deck));

                    await interaction.editReply({
                        embeds: [new EmbedBuilder()
                            .setTitle("🃏 Dealer's Turn")
                            .setDescription(
                                `**Your hand:** ${handToString(playerHand)} (**${handValue(playerHand)}**)\n` +
                                `**Dealer:** ${handToString(dealerHand)}`
                            )
                            .setColor(Colors.DEALER)],
                        components: []
                    });
                }

                // Determine result
                const playerTotal = handValue(playerHand);
                const dealerTotal = handValue(dealerHand);
                let resultText="", resultColor=Colors.LOSE, points=0, money=0;

                // Check for blackjack
                if (playerTotal===21 && playerHand.length===2) 
                    { 
                        resultText="Blackjack!"; 
                        user.streakCurrent++; 
                        points=2; 
                        money=15; 
                        resultColor=Colors.BLACKJACK; 

                        user.money += money;
                        user.wins++;
                        user.blackjacks++;
                        user.rounds++;
                        user.moneyGained += money;
                        user.moneyNet = user.moneyGained - user.moneyLost;
                        streak = user.streakCurrent;
                        if(user.streakCurrent > user.streakBest)
                        {
                            user.streakBest = user.streakCurrent;
                        }
                        user.points += (points * streak);
                        await user.save();
                    }

                else if (playerTotal > 21) 
                { 
                    resultText="Bust! You lose!"; 
                    points=-1; 
                    money=-10; 
                    user.streakCurrent=0; 
                    resultColor=Colors.LOSE;
                    
                    user.money += money;
                    user.losses += 1;
                    user.rounds += 1;
                    user.moneyLost += 10;
                    user.moneyNet = user.moneyGained-user.moneyLost;
                    user.points += points;
                    streak = 0;
                    await user.save();
                }
                else if (dealerTotal > 21 || playerTotal > dealerTotal) 
                { 
                    resultText="You win!"; 
                    user.streakCurrent++; 
                    points=1;  
                    money=10;
                    resultColor=Colors.WIN;

                    user.money += money;
                    user.wins++;
                    user.rounds++;
                    user.moneyGained += 10;
                    user.moneyNet = user.moneyGained - user.moneyLost;
                    streak = user.streakCurrent;
                    if(user.streakCurrent > user.streakBest)
                    {
                        user.streakBest = user.streakCurrent;
                    }
                    user.points += (points * streak);
                    await user.save();

                }
                else if (playerTotal < dealerTotal) 
                {
                    resultText="You lose!"; 
                    points=-1; 
                    money=-10; 
                    user.streakCurrent=0; 
                    resultColor=Colors.LOSE;
                    
                    user.money += money;
                    user.losses++;
                    user.rounds++;
                    user.moneyLost += 10;
                    user.moneyNet = user.moneyGained - user.moneyLost;
                    streak = 0;
                    user.points--;
                    await user.save();
                }
                else 
                { 
                    resultText="Tie!"; 
                    points=0; 
                    money=0; 
                    user.streakCurrent = 0; 
                    resultColor=Colors.PLAYER; 

                    user.ties++;
                    user.rounds++;
                    streak = 0;
                    await user.save();
                }



                await interaction.editReply({
                    embeds: [new EmbedBuilder()
                        .setTitle("🏁 Results")
                        .setDescription(
                            `**Your hand:** ${handToString(playerHand)} (**${playerTotal}**)\n`+
                            `**Dealer:** ${handToString(dealerHand)} (**${dealerTotal}**)\n\n`+
                            `${resultText}\nMoney Earned: $${money}\nPoints Earned: ${points * streak} (${points} points * ${streak} streak)`
                        )
                        .setColor(resultColor)],
                    components: []
                });
            }
        });

        collector.on("end", async () => {
            if (!collector.ended) {
                await interaction.editReply({ content: "⏰ Game timed out!", components: [] });
            }
        });
    }
};
