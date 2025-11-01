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

module.exports = {
    data: new SlashCommandBuilder()
        .setName("blackjack")
        .setDescription("Play a game of blackjack!"),
    async execute(interaction) {
        let user = await User.findOne({ userId: interaction.user.id });

        if (!user || user.money < 10) {
            return interaction.reply({
                content: `You do not have enough money to play Blackjack! You need at least $10!`,
                ephemeral: true
            });
        }

        startBlackjack(interaction, user, true);

        async function startBlackjack(interaction, user, firstGame = false) {
            const deck = createDeck();
            const playerHand = [drawCard(deck), drawCard(deck)];
            const dealerHand = [drawCard(deck), drawCard(deck)];

            const buttons = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder().setCustomId("hit").setLabel("Hit").setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId("stand").setLabel("Stand").setStyle(ButtonStyle.Danger)
                );

            const embed = new EmbedBuilder()
                .setTitle("🃏 Blackjack")
                .setDescription(`**Your hand:** ${handToString(playerHand)} (**${handValue(playerHand)}**)\n` +
                                `**Dealer:** ${handToString(dealerHand, true)}`)
                .setColor(Colors.PLAYER);

            // Reply or followUp depending on first game
            if (firstGame) {
                await interaction.reply({ embeds: [embed], components: [buttons], ephemeral: true });
            } else {
                await interaction.followUp({ embeds: [embed], components: [buttons], ephemeral: true });
            }

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
                        user.money -= 10;
                        user.losses++;
                        user.rounds++;
                        user.moneyLost += 10;
                        user.moneyNet = user.moneyGained - user.moneyLost;
                        user.streakCurrent = 0;
                        user.points--;
                        await user.save();

                        const bustEmbed = new EmbedBuilder()
                            .setTitle("💥 Bust!")
                            .setDescription(`Your hand: ${handToString(playerHand)} (**${total}**) — You lose!\nMoney: -$10\nPoints: -1`)
                            .setColor(Colors.LOSE);

                        await i.update({ embeds: [bustEmbed], components: [] });
                        return await handlePlayAgain(interaction, user);
                    } else {
                        const playerEmbed = new EmbedBuilder()
                            .setTitle("🃏 Blackjack")
                            .setDescription(`**Your hand:** ${handToString(playerHand)} (**${total}**)\n` +
                                            `**Dealer:** ${handToString(dealerHand, true)}`)
                            .setColor(Colors.PLAYER);
                        await i.update({ embeds: [playerEmbed], components: [buttons] });
                    }
                } else if (i.customId === "stand") {
                    collector.stop();

                    // Dealer's turn
                    let dealerEmbed = new EmbedBuilder()
                        .setTitle("🃏 Dealer's Turn")
                        .setDescription(`**Your hand:** ${handToString(playerHand)} (**${handValue(playerHand)}**)\n` +
                                        `**Dealer:** ${handToString([dealerHand[0]], true)}`)
                        .setColor(Colors.DEALER);

                    await i.update({ embeds: [dealerEmbed], components: [] });

                    while (handValue(dealerHand) < 17) {
                        await sleep(1000);
                        dealerHand.push(drawCard(deck));

                        dealerEmbed = new EmbedBuilder()
                            .setTitle("🃏 Dealer's Turn")
                            .setDescription(`**Your hand:** ${handToString(playerHand)} (**${handValue(playerHand)}**)\n` +
                                            `**Dealer:** ${handToString(dealerHand)}`)
                            .setColor(Colors.DEALER);

                        await interaction.followUp({ embeds: [dealerEmbed], ephemeral: true });
                    }

                    // Determine winner
                    const playerTotal = handValue(playerHand);
                    const dealerTotal = handValue(dealerHand);
                    let resultText = "", resultColor = Colors.LOSE, points = 0, money = 0;

                    if (playerTotal > 21) {
                        resultText = "Bust! You lose!";
                        points = -1;
                        money = -10;
                        streak = 0;
                        user.streakCurrent = 0;
                    } else if ((playerTotal === 21 && playerHand.length === 2) && !(dealerTotal === 21 && dealerHand.length === 2)) {
                        resultText = "Blackjack!";
                        points = 2;
                        money = 15;
                        user.streakCurrent++;
                        streak = user.streakCurrent;
                    } else if (dealerTotal > 21 || playerTotal > dealerTotal) {
                        resultText = "You win!";
                        points = 1;
                        money = 10;
                        user.streakCurrent++;
                        streak = user.streakCurrent;
                    } else if (playerTotal < dealerTotal) {
                        resultText = "You lose!";
                        points = -1;
                        money = -10;
                        user.streakCurrent = 0;
                        streak = 0;
                    } else {
                        resultText = "Tie!";
                        points = 0;
                        money = 0;
                        user.streakCurrent = 0;
                        streak = 0;
                    }

                    // Update user stats
                    user.money += money;
                    if (money > 0) user.moneyGained += money;
                    if (money < 0) user.moneyLost += -money;
                    user.moneyNet = user.moneyGained - user.moneyLost;
                    if (points > 0) user.points += points * streak;
                    user.rounds++;
                    await user.save();

                    const resultEmbed = new EmbedBuilder()
                        .setTitle("🏁 Results")
                        .setDescription(`**Your hand:** ${handToString(playerHand)} (**${playerTotal}**)\n` +
                                        `**Dealer:** ${handToString(dealerHand)} (**${dealerTotal}**)\n\n` +
                                        `${resultText}\nMoney Earned: $${money}\nPoints Earned: ${points * streak}`)
                        .setColor(resultColor);

                    await interaction.followUp({ embeds: [resultEmbed], ephemeral: true });
                    await handlePlayAgain(interaction, user);
                }
            });
        }

        // Play Again handler
        async function handlePlayAgain(interaction, user) {
            const playAgainRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder().setCustomId("playAgain").setLabel("Play Again").setStyle(ButtonStyle.Primary)
                );

            const playAgainMessage = await interaction.followUp({
                content: "Do you want to play again?",
                components: [playAgainRow],
                ephemeral: true
            });

            const collector = playAgainMessage.createMessageComponentCollector({
                filter: i => i.user.id === user.userId && i.customId === "playAgain",
                max: 1,
                time: 60000
            });

            collector.on("collect", async i => {
                await i.deferUpdate();
                startBlackjack(interaction, user);
            });
        }
    }
};
