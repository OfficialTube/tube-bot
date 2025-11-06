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
    return hand.map((c,i)=> hideSecond && i===1 ? "[??]" : `${c.value}${c.suit}`).join(" · ");
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const activeGames = new Set();

module.exports = {
    data: new SlashCommandBuilder()
        .setName("blackjack")
        .setDescription("Play a game of blackjack!"),
    async execute(interaction) {
        const userId = interaction.user.id;

        if (activeGames.has(userId)) {
            return interaction.reply({
                content: "🃏 You already have an active Blackjack game! Please finish that one first.",
                ephemeral: true
            });
        }

        activeGames.add(userId);

        try {
            let user = await User.findOne({ userId });
            if (!user || user.money < 10) {
                activeGames.delete(userId);
                return interaction.reply({
                    content: `You need at least $10 to play Blackjack! Chat to earn more money. Use \`/rank\` to check your balance.`,
                    ephemeral: true
                });
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
                filter: i => i.user.id === userId,
                time: 120000
            });

            let streak = user.streakCurrent || 0;

            collector.on("collect", async i => {
                if (i.customId === "hit") {
                    playerHand.push(drawCard(deck));
                    const total = handValue(playerHand);

                    if (total > 21) {
                        collector.stop("bust");
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
                        user.moneyNet = user.moneyGained - user.moneyLost;
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
                    collector.stop("stand");
                    await i.update({ components: [] });

                    // Dealer's turn
                    await interaction.editReply({
                        embeds: [new EmbedBuilder()
                            .setTitle("🃏 Dealer's Turn")
                            .setDescription(
                                `**Your hand:** ${handToString(playerHand)} (**${handValue(playerHand)}**)\n` +
                                `**Dealer:** ${handToString([dealerHand[0]], true)}`
                            )
                            .setColor(Colors.DEALER)],
                        components: []
                    });

                    while (handValue(dealerHand) < 17) {
                        await sleep(1000);
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
                    let resultText = "", resultColor = Colors.LOSE, points = 0, money = 0;

                    if (playerTotal === 21 && playerHand.length === 2 && (dealerHand.length !== 2 || dealerTotal !== 21)) {
                        user.streakCurrent++;
                        points = 2;
                        money = 15;
                        resultColor = Colors.BLACKJACK;
                        user.money += money;
                        user.wins++;
                        user.blackjacks++;
                        user.rounds++;
                        user.moneyGained += money;
                        user.moneyNet = user.moneyGained - user.moneyLost;
                        streak = user.streakCurrent;
                        if (streak > user.streakBest) user.streakBest = streak;
                        user.points += (points * streak);
                        user.pxp += 15;
                        resultText = `Blackjack!\nMoney Earned: $${money}\nPoints Earned: ${points * streak} (${points} × ${streak} streak)`;
                        await user.save();
                    } else if (dealerTotal > 21 || playerTotal > dealerTotal) {
                        user.streakCurrent++;
                        points = 1;
                        money = 10;
                        resultColor = Colors.WIN;
                        user.money += money;
                        user.wins++;
                        user.rounds++;
                        user.moneyGained += 10;
                        user.moneyNet = user.moneyGained - user.moneyLost;
                        streak = user.streakCurrent;
                        if (streak > user.streakBest) user.streakBest = streak;
                        user.points += (points * streak);
                        user.pxp += 10;
                        resultText = `You win!\nMoney Earned: $${money}\nPoints Earned: ${points * streak} (${points} × ${streak} streak)`;
                        await user.save();
                    } else if (playerTotal < dealerTotal) {
                        points = -1;
                        money = -10;
                        user.streakCurrent = 0;
                        resultColor = Colors.LOSE;
                        user.money += money;
                        user.losses++;
                        user.rounds++;
                        user.moneyLost += 10;
                        user.moneyNet = user.moneyGained - user.moneyLost;
                        streak = 0;
                        user.points--;
                        resultText = `You lose!\nMoney Earned: -$10\nPoints Earned: ${points}`;
                        await user.save();
                    } else {
                        user.ties++;
                        user.rounds++;
                        user.streakCurrent = 0;
                        resultColor = Colors.PLAYER;
                        resultText = `Tie!\nMoney Earned: $${money}\nPoints Earned: ${points}`;
                        await user.save();
                    }

                    await interaction.editReply({
                        embeds: [new EmbedBuilder()
                            .setTitle("🏁 Results")
                            .setDescription(
                                `**Your hand:** ${handToString(playerHand)} (**${playerTotal}**)\n` +
                                `**Dealer:** ${handToString(dealerHand)} (**${dealerTotal}**)\n\n` +
                                `${resultText}`
                            )
                            .setColor(resultColor)],
                        components: []
                    });
                }
            });

            collector.on("end", async (_collected, reason) => {
                // Clean up lock
                activeGames.delete(userId);

                if (reason !== "bust" && reason !== "stand") {
                    try {
                        await interaction.editReply({
                            content: "⏰ Game timed out!",
                            components: [],
                            embeds: []
                        });
                    } catch {}
                }
            });
        } catch (err) {
            console.error("Blackjack error:", err);
            activeGames.delete(userId);
            if (interaction.replied || interaction.deferred)
                await interaction.followUp({ content: "An error occurred during your game!", ephemeral: true });
            else
                await interaction.reply({ content: "An error occurred during your game!", ephemeral: true });
        }
    }
};
