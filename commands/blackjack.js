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
                content: `You do not have enough money to play Blackjack! You need at least $10! Chat to earn money. You can check how much money you have by typing \`/rank\`.`,
                ephemeral: true
            });
        }

        startBlackjack(interaction, user, true);

        async function startBlackjack(inter, user, firstGame = true) {
            const deck = createDeck();
            const playerHand = [drawCard(deck), drawCard(deck)];
            const dealerHand = [drawCard(deck), drawCard(deck)];

            const actionRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder().setCustomId("hit").setLabel("Hit").setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId("stand").setLabel("Stand").setStyle(ButtonStyle.Danger)
                );

            const embed = new EmbedBuilder()
                .setTitle("🃏 Blackjack")
                .setDescription(`**Your hand:** ${handToString(playerHand)} (**${handValue(playerHand)}**)\n` +
                                `**Dealer:** ${handToString(dealerHand, true)}`)
                .setColor(Colors.PLAYER);

            // Send initial ephemeral message
            if (firstGame) {
                await inter.reply({ embeds: [embed], components: [actionRow], ephemeral: true });
            } else {
                await inter.followUp({ embeds: [embed], components: [actionRow], ephemeral: true });
            }

            const collector = inter.channel.createMessageComponentCollector({
                filter: i => i.user.id === inter.user.id,
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
                        user.moneyNet = user.moneyGained - user.moneyLost;
                        user.streakCurrent = 0;
                        user.points--;
                        await user.save();
                    } else {
                        await i.update({
                            embeds: [new EmbedBuilder()
                                .setTitle("🃏 Blackjack")
                                .setDescription(`**Your hand:** ${handToString(playerHand)} (**${total}**)\n` +
                                                `**Dealer:** ${handToString(dealerHand,true)}`)
                                .setColor(Colors.PLAYER)],
                            components: [actionRow]
                        });
                    }
                } else if (i.customId === "stand") {
                    collector.stop();

                    // Dealer's turn
                    await i.update({
                        embeds: [new EmbedBuilder()
                            .setTitle("🃏 Dealer's Turn")
                            .setDescription(`**Your hand:** ${handToString(playerHand)} (**${handValue(playerHand)}**)\n` +
                                            `**Dealer:** ${handToString([dealerHand[0]], true)}`)
                            .setColor(Colors.DEALER)],
                        components: []
                    });

                    while (handValue(dealerHand) < 17) {
                        await sleep(1000);
                        dealerHand.push(drawCard(deck));

                        await inter.editReply({
                            embeds: [new EmbedBuilder()
                                .setTitle("🃏 Dealer's Turn")
                                .setDescription(`**Your hand:** ${handToString(playerHand)} (**${handValue(playerHand)}**)\n` +
                                                `**Dealer:** ${handToString(dealerHand)}`)
                                .setColor(Colors.DEALER)],
                            components: []
                        });
                    }

                    // Determine result
                    const playerTotal = handValue(playerHand);
                    const dealerTotal = handValue(dealerHand);
                    let resultText = "", resultColor = Colors.LOSE, points = 0, money = 0;

                    if (playerTotal === 21 && playerHand.length === 2 && (dealerHand.length !== 2 || dealerTotal !== 21)) {
                        resultText = "Blackjack!";
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
                        if (user.streakCurrent > user.streakBest) user.streakBest = user.streakCurrent;
                        user.points += points * streak;
                        user.pxp += 15;
                        await user.save();
                    } else if (playerTotal > 21) {
                        resultText = "Bust! You lose!";
                        points = -1;
                        money = -10;
                        user.streakCurrent = 0;
                        resultColor = Colors.LOSE;

                        user.money += money;
                        user.losses++;
                        user.rounds++;
                        user.moneyLost += 10;
                        user.moneyNet = user.moneyGained - user.moneyLost;
                        user.points += points;
                        streak = 0;
                        await user.save();
                    } else if (dealerTotal > 21 || playerTotal > dealerTotal) {
                        resultText = "You win!";
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
                        if (user.streakCurrent > user.streakBest) user.streakBest = user.streakCurrent;
                        user.points += points * streak;
                        user.pxp += 10;
                        await user.save();
                    } else if (playerTotal < dealerTotal) {
                        resultText = "You lose!";
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
                        await user.save();
                    } else {
                        resultText = "Tie!";
                        points = 0;
                        money = 0;
                        user.streakCurrent = 0;
                        resultColor = Colors.PLAYER;

                        user.ties++;
                        user.rounds++;
                        streak = 0;
                        await user.save();
                    }

                    const playAgainRow = new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder().setCustomId("playAgain").setLabel("Play Again").setStyle(ButtonStyle.Primary)
                        );

                    await inter.editReply({
                        embeds: [new EmbedBuilder()
                            .setTitle("🏁 Results")
                            .setDescription(`**Your hand:** ${handToString(playerHand)} (**${playerTotal}**)\n` +
                                            `**Dealer:** ${handToString(dealerHand)} (**${dealerTotal}**)\n\n` +
                                            `${resultText}\nMoney Earned: $${money}\nPoints Earned: ${points * streak} (${points} points * ${streak} streak)`)
                            .setColor(resultColor)],
                        components: [playAgainRow]
                    });

                    // Play Again collector
                    const playAgainCollector = inter.channel.createMessageComponentCollector({
                        filter: b => b.user.id === inter.user.id && b.customId === "playAgain",
                        time: 60000
                    });

                    playAgainCollector.on("collect", async b => {
                        playAgainCollector.stop();
                        await b.deferUpdate();
                        startBlackjack(inter, user, false);
                    });
                }
            });
        }
    }
};
