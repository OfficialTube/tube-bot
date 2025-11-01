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
        const user = await User.findOne({ userId: interaction.user.id });

        if (!user || user.money < 10) {
            return interaction.reply({
                content: "You do not have enough money to play Blackjack! You need at least $10!",
                ephemeral: true
            });
        }

        startBlackjack(interaction, user, true);

        async function startBlackjack(inter, user, firstGame = false) {
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

            if (firstGame) await inter.reply({ embeds: [embed], components: [buttons], ephemeral: true });
            else await inter.followUp({ embeds: [embed], components: [buttons], ephemeral: true });

            const collector = inter.channel.createMessageComponentCollector({
                filter: i => i.user.id === user.userId,
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
                                                `**Dealer:** ${handToString(dealerHand, true)}`)
                                .setColor(Colors.PLAYER)],
                            components: [buttons]
                        });
                    }
                } else if (i.customId === "stand") {
                    collector.stop();
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
                        await inter.followUp({
                            embeds: [new EmbedBuilder()
                                .setTitle("🃏 Dealer's Turn")
                                .setDescription(`**Your hand:** ${handToString(playerHand)} (**${handValue(playerHand)}**)\n` +
                                                `**Dealer:** ${handToString(dealerHand)}`)
                                .setColor(Colors.DEALER)],
                            ephemeral: true
                        });
                    }

                    const playerTotal = handValue(playerHand);
                    const dealerTotal = handValue(dealerHand);

                    let resultText="", resultColor=Colors.LOSE, points=0, money=0;

                    if (playerTotal===21 && playerHand.length===2 && (dealerHand.length !== 2 || dealerTotal !== 21)) {
                        resultText = "Blackjack!";
                        points = 2;
                        money = 15;
                        resultColor = Colors.BLACKJACK;
                        user.streakCurrent++;
                        user.wins++;
                        user.blackjacks++;
                        user.rounds++;
                        user.money += money;
                        user.moneyGained += money;
                        streak = user.streakCurrent;
                        if (user.streakCurrent > user.streakBest) user.streakBest = user.streakCurrent;
                        user.points += points * streak;
                        user.pxp += 15;
                    } else if (playerTotal > 21) {
                        resultText = "Bust! You lose!";
                        points = -1;
                        money = -10;
                        user.streakCurrent = 0;
                        user.losses++;
                        user.rounds++;
                        user.money += money;
                        user.moneyLost += 10;
                        streak = 0;
                        user.points += points;
                    } else if (dealerTotal > 21 || playerTotal > dealerTotal) {
                        resultText = "You win!";
                        points = 1;
                        money = 10;
                        resultColor = Colors.WIN;
                        user.streakCurrent++;
                        user.wins++;
                        user.rounds++;
                        user.money += money;
                        user.moneyGained += money;
                        streak = user.streakCurrent;
                        if (user.streakCurrent > user.streakBest) user.streakBest = user.streakCurrent;
                        user.points += points * streak;
                        user.pxp += 10;
                    } else if (playerTotal < dealerTotal) {
                        resultText = "You lose!";
                        points = -1;
                        money = -10;
                        user.streakCurrent = 0;
                        resultColor = Colors.LOSE;
                        user.losses++;
                        user.rounds++;
                        user.money += money;
                        user.moneyLost += 10;
                        streak = 0;
                        user.points += points;
                    } else {
                        resultText = "Tie!";
                        points = 0;
                        money = 0;
                        user.streakCurrent = 0;
                        streak = 0;
                        resultColor = Colors.PLAYER;
                        user.ties++;
                        user.rounds++;
                    }
                    user.moneyNet = user.moneyGained - user.moneyLost;
                    await user.save();

                    const resultEmbed = new EmbedBuilder()
                        .setTitle("🏁 Results")
                        .setDescription(`**Your hand:** ${handToString(playerHand)} (**${playerTotal}**)\n` +
                                        `**Dealer:** ${handToString(dealerHand)} (**${dealerTotal}**)\n\n` +
                                        `${resultText}\nMoney Earned: $${money}\nPoints Earned: ${points * streak} (${points} points * ${streak} streak)`)
                        .setColor(resultColor);

                    const playAgainRow = new ActionRowBuilder()
                        .addComponents(new ButtonBuilder().setCustomId("playAgain").setLabel("Play Again").setStyle(ButtonStyle.Primary));

                    await inter.followUp({ embeds: [resultEmbed], components: [playAgainRow], ephemeral: true });

                    // Play Again button collector
                    const playAgainCollector = inter.channel.createMessageComponentCollector({
                        filter: btn => btn.user.id === user.userId && btn.customId === "playAgain",
                        max: 1,
                        time: 60000
                    });

                    playAgainCollector.on("collect", async btn => {
                        await btn.update({ components: [] }); // remove button
                        startBlackjack(inter, user, false); // start a new round
                    });
                }
            });
        }
    }
};
