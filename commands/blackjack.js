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

        // Start the first round
        startRound(interaction, user);

        async function startRound(interaction, user) {
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
                .setDescription(
                    `**Your hand:** ${handToString(playerHand)} (**${handValue(playerHand)}**)\n`+
                    `**Dealer:** ${handToString(dealerHand,true)}`
                )
                .setColor(Colors.PLAYER);

            // Send the initial ephemeral message
            const message = await interaction.reply({ embeds: [embed], components: [buttons], ephemeral: true, fetchReply: true });

            // Component collector for Hit/Stand
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
                        await endGame(i, playerHand, dealerHand, total, "bust");
                    } else {
                        await i.update({
                            embeds: [new EmbedBuilder()
                                .setTitle("🃏 Blackjack")
                                .setDescription(
                                    `**Your hand:** ${handToString(playerHand)} (**${total}**)\n` +
                                    `**Dealer:** ${handToString(dealerHand,true)}`
                                )
                                .setColor(Colors.PLAYER)
                            ],
                            components: [buttons]
                        });
                    }
                } else if (i.customId === "stand") {
                    collector.stop();
                    await dealerTurn(i, playerHand, dealerHand);
                }
            });

            // Dealer's turn function
            async function dealerTurn(i, playerHand, dealerHand) {
                let dealerTotal = handValue(dealerHand);
                await i.update({
                    embeds: [new EmbedBuilder()
                        .setTitle("🃏 Dealer's Turn")
                        .setDescription(
                            `**Your hand:** ${handToString(playerHand)} (**${handValue(playerHand)}**)\n` +
                            `**Dealer:** ${handToString(dealerHand)}`
                        )
                        .setColor(Colors.DEALER)
                    ],
                    components: []
                });

                while (dealerTotal < 17) {
                    await sleep(1000);
                    dealerHand.push(drawCard(deck));
                    dealerTotal = handValue(dealerHand);

                    await i.editReply({
                        embeds: [new EmbedBuilder()
                            .setTitle("🃏 Dealer's Turn")
                            .setDescription(
                                `**Your hand:** ${handToString(playerHand)} (**${handValue(playerHand)}**)\n` +
                                `**Dealer:** ${handToString(dealerHand)}`
                            )
                            .setColor(Colors.DEALER)
                        ],
                        components: []
                    });
                }

                await endGame(i, playerHand, dealerHand, handValue(playerHand));
            }

            // End game function
            async function endGame(i, playerHand, dealerHand, playerTotal, reason=null) {
                const dealerTotal = handValue(dealerHand);
                let resultText = "";
                let resultColor = Colors.PLAYER;
                let money = 0;
                let points = 0;

                if (reason === "bust") {
                    resultText = "💥 Bust! You lose!";
                    money = -10;
                    points = -1;
                    user.streakCurrent = 0;
                    resultColor = Colors.LOSE;
                    user.losses++;
                } else {
                    if (playerTotal === 21 && playerHand.length === 2 && dealerTotal !== 21) {
                        resultText = "🎉 Blackjack!";
                        money = 15;
                        points = 2;
                        user.streakCurrent++;
                        resultColor = Colors.BLACKJACK;
                        user.blackjacks++;
                        user.wins++;
                    } else if (playerTotal > dealerTotal || dealerTotal > 21) {
                        resultText = "✅ You win!";
                        money = 10;
                        points = 1;
                        user.streakCurrent++;
                        resultColor = Colors.WIN;
                        user.wins++;
                    } else if (playerTotal < dealerTotal) {
                        resultText = "❌ You lose!";
                        money = -10;
                        points = -1;
                        user.streakCurrent = 0;
                        resultColor = Colors.LOSE;
                        user.losses++;
                    } else {
                        resultText = "🤝 Tie!";
                        money = 0;
                        points = 0;
                        user.streakCurrent = 0;
                        resultColor = Colors.PLAYER;
                        user.ties++;
                    }
                }

                // Update money/points
                user.money += money;
                user.rounds = (user.rounds || 0) + 1;
                user.moneyGained = (user.moneyGained || 0) + Math.max(0, money);
                user.moneyLost = (user.moneyLost || 0) + Math.max(0, -money);
                user.moneyNet = user.moneyGained - user.moneyLost;
                user.points = (user.points || 0) + points;
                if (user.streakCurrent > user.streakBest) user.streakBest = user.streakCurrent;
                await user.save();

                // Play Again button
                const playAgainRow = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder().setCustomId("playAgain").setLabel("Play Again").setStyle(ButtonStyle.Primary)
                    );

                await i.editReply({
                    embeds: [new EmbedBuilder()
                        .setTitle("🏁 Results")
                        .setDescription(
                            `**Your hand:** ${handToString(playerHand)} (**${playerTotal}**)\n` +
                            `**Dealer:** ${handToString(dealerHand)} (**${dealerTotal}**)\n\n` +
                            `${resultText}\nMoney: $${money}\nPoints: ${points}`
                        )
                        .setColor(resultColor)
                    ],
                    components: [playAgainRow]
                });

                // Play Again collector
                const playAgainCollector = i.message.createMessageComponentCollector({
                    filter: b => b.user.id === interaction.user.id && b.customId === "playAgain",
                    max: 1,
                    time: 60000
                });

                playAgainCollector.on("collect", async b => {
                    await b.deferUpdate(); // acknowledge button
                    startRound(interaction, user);
                });
            }
        }
    }
};
