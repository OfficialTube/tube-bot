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

        startBlackjack(interaction, user);

        async function startBlackjack(inter, user) {
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
                .setDescription(`**Your hand:** ${handToString(playerHand)} (**${handValue(playerHand)}**)\n**Dealer:** ${handToString(dealerHand, true)}`)
                .setColor(Colors.PLAYER);

            // Send initial ephemeral message
            let message = await inter.reply({ embeds: [embed], components: [buttons], ephemeral: true, fetchReply: true });

            let streak = user.streakCurrent || 0;

            const collector = message.createMessageComponentCollector({
                filter: i => i.user.id === inter.user.id,
                time: 120000
            });

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

                        await i.update({
                            embeds: [new EmbedBuilder()
                                .setTitle("💥 Bust!")
                                .setDescription(`Your hand: ${handToString(playerHand)} (**${total}**) — You lose!\nMoney: -$10\nPoints: -1`)
                                .setColor(Colors.LOSE)],
                            components: []
                        });
                        showPlayAgain(message);
                    } else {
                        await i.update({
                            embeds: [new EmbedBuilder()
                                .setTitle("🃏 Blackjack")
                                .setDescription(`**Your hand:** ${handToString(playerHand)} (**${total}**)\n**Dealer:** ${handToString(dealerHand,true)}`)
                                .setColor(Colors.PLAYER)],
                            components: [buttons]
                        });
                    }
                } else if (i.customId === "stand") {
                    collector.stop();

                    await i.update({
                        embeds: [new EmbedBuilder()
                            .setTitle("🃏 Dealer's Turn")
                            .setDescription(`**Your hand:** ${handToString(playerHand)} (**${handValue(playerHand)}**)\n**Dealer:** ${handToString([dealerHand[0]], true)}`)
                            .setColor(Colors.DEALER)],
                        components: []
                    });

                    // Dealer draws
                    while(handValue(dealerHand) < 17) {
                        await sleep(1000);
                        dealerHand.push(drawCard(deck));

                        await message.edit({
                            embeds: [new EmbedBuilder()
                                .setTitle("🃏 Dealer's Turn")
                                .setDescription(`**Your hand:** ${handToString(playerHand)} (**${handValue(playerHand)}**)\n**Dealer:** ${handToString(dealerHand)}`)
                                .setColor(Colors.DEALER)],
                            components: []
                        });
                    }

                    // Determine result
                    const playerTotal = handValue(playerHand);
                    const dealerTotal = handValue(dealerHand);

                    let resultText="", resultColor=Colors.LOSE, points=0, money=0;

                    if (playerTotal === 21 && playerHand.length === 2 && dealerTotal !== 21) {
                        resultText="Blackjack!";
                        points=2;
                        money=15;
                        resultColor=Colors.BLACKJACK;
                        user.streakCurrent++;
                        user.wins++;
                        user.blackjacks++;
                        user.rounds++;
                        user.money += money;
                        user.moneyGained += money;
                        user.moneyNet = user.moneyGained - user.moneyLost;
                        streak = user.streakCurrent;
                        if (user.streakCurrent > user.streakBest) user.streakBest = user.streakCurrent;
                        user.points += (points * streak);
                        user.pxp += 15;
                        await user.save();
                    } else if (playerTotal > 21 || playerTotal < dealerTotal && dealerTotal <= 21) {
                        resultText="You lose!";
                        points=-1;
                        money=-10;
                        resultColor=Colors.LOSE;
                        user.streakCurrent = 0;
                        user.losses++;
                        user.rounds++;
                        user.money += money;
                        user.moneyLost += 10;
                        user.moneyNet = user.moneyGained - user.moneyLost;
                        user.points += points;
                        streak = 0;
                        await user.save();
                    } else if (playerTotal > dealerTotal || dealerTotal > 21) {
                        resultText="You win!";
                        points=1;
                        money=10;
                        resultColor=Colors.WIN;
                        user.streakCurrent++;
                        user.wins++;
                        user.rounds++;
                        user.money += money;
                        user.moneyGained += money;
                        user.moneyNet = user.moneyGained - user.moneyLost;
                        streak = user.streakCurrent;
                        if (user.streakCurrent > user.streakBest) user.streakBest = user.streakCurrent;
                        user.points += (points * streak);
                        user.pxp += 10;
                        await user.save();
                    } else {
                        resultText="Tie!";
                        points=0;
                        money=0;
                        resultColor=Colors.PLAYER;
                        user.streakCurrent = 0;
                        user.ties++;
                        user.rounds++;
                        streak = 0;
                        await user.save();
                    }

                    // Show result
                    await message.edit({
                        embeds: [new EmbedBuilder()
                            .setTitle("🏁 Results")
                            .setDescription(
                                `**Your hand:** ${handToString(playerHand)} (**${playerTotal}**)\n` +
                                `**Dealer:** ${handToString(dealerHand)} (**${dealerTotal}**)\n\n` +
                                `${resultText}\nMoney Earned: $${money}\nPoints Earned: ${points * streak} (${points} points * ${streak} streak)`
                            )
                            .setColor(resultColor)
                        ],
                        components: [new ActionRowBuilder().addComponents(
                            new ButtonBuilder().setCustomId("playAgain").setLabel("Play Again").setStyle(ButtonStyle.Primary)
                        )]
                    });

                    // Collector for play again
                    const playAgainCollector = message.createMessageComponentCollector({
                        filter: b => b.user.id === inter.user.id && b.customId === "playAgain",
                        time: 60000
                    });

                    playAgainCollector.on("collect", async b => {
                        playAgainCollector.stop();
                        await b.deferUpdate();
                        startBlackjack(inter, user); // recursively start new round
                    });
                }
            });
        }
    }
};
