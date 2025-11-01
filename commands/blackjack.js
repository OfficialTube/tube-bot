const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");
const User = require("../models/User");

const Colors = {
    PLAYER: 0x3498db,
    DEALER: 0x95a5a6,
    WIN: 0x2ecc71,
    LOSE: 0xe74c3c,
    BLACKJACK: 0xf1c40f
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
        if (!card) continue;
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

        // Defer initial reply to avoid InteractionNotReplied errors
        await interaction.deferReply({ ephemeral: true });
        startGame(interaction, user);

        async function startGame(interaction, user) {
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
                .setDescription(`**Your hand:** ${handToString(playerHand)} (**${handValue(playerHand)}**)\n` +
                                `**Dealer:** ${handToString(dealerHand, true)}`)
                .setColor(Colors.PLAYER);

            const message = await interaction.editReply({ embeds: [embed], components: [row] });

            const collector = message.createMessageComponentCollector({
                filter: i => i.user.id === interaction.user.id,
                time: 120000
            });

            collector.on("collect", async i => {
                if (i.customId === "hit") {
                    playerHand.push(drawCard(deck));
                    const total = handValue(playerHand);

                    if (total > 21) {
                        collector.stop();
                        await endGame(i, playerHand, dealerHand, "Bust! You lose!", Colors.LOSE, -10, -1);
                    } else {
                        await i.update({
                            embeds: [new EmbedBuilder()
                                .setTitle("🃏 Blackjack")
                                .setDescription(`**Your hand:** ${handToString(playerHand)} (**${total}**)\n` +
                                                `**Dealer:** ${handToString(dealerHand, true)}`)
                                .setColor(Colors.PLAYER)],
                            components: [row]
                        });
                    }
                } else if (i.customId === "stand") {
                    collector.stop();
                    await dealerTurn(i, playerHand, dealerHand);
                }
            });

            async function dealerTurn(interactionOrButton, playerHand, dealerHand) {
                let dealerTotal = handValue(dealerHand);
                const dealerEmbed = new EmbedBuilder()
                    .setTitle("🃏 Dealer's Turn")
                    .setDescription(`**Your hand:** ${handToString(playerHand)} (**${handValue(playerHand)}**)\n` +
                                    `**Dealer:** ${handToString([dealerHand[0]], true)}`)
                    .setColor(Colors.DEALER);

                await interactionOrButton.update({ embeds: [dealerEmbed], components: [] });

                while (dealerTotal < 17) {
                    await sleep(1000);
                    dealerHand.push(drawCard(deck));
                    dealerTotal = handValue(dealerHand);
                    const updateEmbed = new EmbedBuilder()
                        .setTitle("🃏 Dealer's Turn")
                        .setDescription(`**Your hand:** ${handToString(playerHand)} (**${handValue(playerHand)}**)\n` +
                                        `**Dealer:** ${handToString(dealerHand)}`)
                        .setColor(Colors.DEALER);

                    await interactionOrButton.editReply({ embeds: [updateEmbed] });
                }

                // Determine result
                const playerTotal = handValue(playerHand);
                let resultText = "", resultColor = Colors.LOSE, points = 0, money = 0;

                if (playerTotal === 21 && playerHand.length === 2 && (dealerHand.length !== 2 || handValue(dealerHand) !== 21)) {
                    resultText = "Blackjack!";
                    resultColor = Colors.BLACKJACK;
                    points = 2;
                    money = 15;
                    user.streakCurrent++;
                } else if (playerTotal > 21 || dealerTotal > playerTotal && dealerTotal <= 21) {
                    resultText = "You lose!";
                    resultColor = Colors.LOSE;
                    points = -1;
                    money = -10;
                    user.streakCurrent = 0;
                } else if (dealerTotal > 21 || playerTotal > dealerTotal) {
                    resultText = "You win!";
                    resultColor = Colors.WIN;
                    points = 1;
                    money = 10;
                    user.streakCurrent++;
                } else {
                    resultText = "Tie!";
                    resultColor = Colors.PLAYER;
                    points = 0;
                    money = 0;
                    user.streakCurrent = 0;
                }

                // Update user stats
                user.money += money;
                if (money > 0) user.wins++; 
                else if (money < 0) user.losses++;
                else user.ties++;
                user.rounds++;
                user.moneyGained += money > 0 ? money : 0;
                user.moneyLost += money < 0 ? -money : 0;
                user.moneyNet = user.moneyGained - user.moneyLost;
                user.points += points * (user.streakCurrent || 1);
                if (user.streakCurrent > (user.streakBest || 0)) user.streakBest = user.streakCurrent;
                await user.save();

                // Send result + Play Again button
                const playAgainRow = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder().setCustomId("playAgain").setLabel("Play Again").setStyle(ButtonStyle.Primary)
                    );

                const resultEmbed = new EmbedBuilder()
                    .setTitle("🏁 Results")
                    .setDescription(`**Your hand:** ${handToString(playerHand)} (**${playerTotal}**)\n` +
                                    `**Dealer:** ${handToString(dealerHand)} (**${dealerTotal}**)\n\n` +
                                    `${resultText}\nMoney Earned: $${money}\nPoints Earned: ${points * (user.streakCurrent || 1)}`)
                    .setColor(resultColor);

                await interactionOrButton.editReply({ embeds: [resultEmbed], components: [playAgainRow] });

                // Play Again collector
                const collector2 = interactionOrButton.channel.createMessageComponentCollector({
                    filter: i => i.user.id === interaction.user.id && i.customId === "playAgain",
                    time: 60000
                });

                collector2.on("collect", async b => {
                    await b.deferUpdate();
                    startGame(interaction, user); // always pass ORIGINAL interaction
                });
            }

            async function endGame(interactionOrButton, playerHand, dealerHand, resultText, color, money, points) {
                const playAgainRow = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder().setCustomId("playAgain").setLabel("Play Again").setStyle(ButtonStyle.Primary)
                    );

                const resultEmbed = new EmbedBuilder()
                    .setTitle("🏁 Results")
                    .setDescription(`**Your hand:** ${handToString(playerHand)} (**${handValue(playerHand)}**)\n` +
                                    `**Dealer:** ${handToString(dealerHand)} (**${handValue(dealerHand)}**)\n\n` +
                                    `${resultText}\nMoney Earned: $${money}\nPoints Earned: ${points}`)
                    .setColor(color);

                // Update user stats
                user.money += money;
                if (money > 0) user.wins++; 
                else if (money < 0) user.losses++;
                else user.ties++;
                user.rounds++;
                user.moneyGained += money > 0 ? money : 0;
                user.moneyLost += money < 0 ? -money : 0;
                user.moneyNet = user.moneyGained - user.moneyLost;
                user.points += points;
                await user.save();

                await interactionOrButton.editReply({ embeds: [resultEmbed], components: [playAgainRow] });

                // Play Again collector
                const collector2 = interactionOrButton.channel.createMessageComponentCollector({
                    filter: i => i.user.id === interaction.user.id && i.customId === "playAgain",
                    time: 60000
                });

                collector2.on("collect", async b => {
                    await b.deferUpdate();
                    startGame(interaction, user); // pass ORIGINAL interaction
                });
            }
        }
    }
};
