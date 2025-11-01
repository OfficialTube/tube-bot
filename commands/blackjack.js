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
        if (!card) continue;
        if (["J","Q","K"].includes(card.value)) total += 10;
        else if (card.value === "A") { total += 11; aces++; }
        else total += parseInt(card.value);
    }
    while (total > 21 && aces > 0) { total -= 10; aces--; }
    return total;
}

function handToString(hand, hideSecond=false) {
    return hand.map((c,i)=> hideSecond && i===1 ? "[??]" : `${c?.value}${c?.suit}`).join(" · ");
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

        startRound(interaction, user);

        async function startRound(interaction, user) {
            const deck = createDeck();
            const playerHand = [drawCard(deck), drawCard(deck)];
            const dealerHand = [drawCard(deck), drawCard(deck)];

            const buttonsRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder().setCustomId("hit").setLabel("Hit").setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId("stand").setLabel("Stand").setStyle(ButtonStyle.Danger)
                );

            const embed = new EmbedBuilder()
                .setTitle("🃏 Blackjack")
                .setDescription(`**Your hand:** ${handToString(playerHand)} (**${handValue(playerHand)}**)\n**Dealer:** ${handToString(dealerHand,true)}`)
                .setColor(Colors.PLAYER);

            // Send ephemeral message and fetch it
            const gameMessage = await interaction.reply({ embeds: [embed], components: [buttonsRow], ephemeral: true, fetchReply: true });

            const collector = gameMessage.createMessageComponentCollector({
                filter: i => i.user.id === interaction.user.id,
                time: 120000
            });

            collector.on("collect", async i => {
                if (i.customId === "hit") {
                    playerHand.push(drawCard(deck));
                    const total = handValue(playerHand);

                    if (total > 21) {
                        collector.stop();
                        await endGame(i, user, playerHand, dealerHand, -10, -1, "💥 Bust! You lose!", Colors.LOSE);
                    } else {
                        await i.update({
                            embeds: [new EmbedBuilder()
                                .setTitle("🃏 Blackjack")
                                .setDescription(`**Your hand:** ${handToString(playerHand)} (**${total}**)\n**Dealer:** ${handToString(dealerHand,true)}`)
                                .setColor(Colors.PLAYER)],
                            components: [buttonsRow]
                        });
                    }
                } else if (i.customId === "stand") {
                    collector.stop();
                    await dealerTurn(i, user, playerHand, dealerHand, deck);
                }
            });
        }

        async function dealerTurn(interaction, user, playerHand, dealerHand, deck) {
            await interaction.update({
                embeds: [new EmbedBuilder()
                    .setTitle("🃏 Dealer's Turn")
                    .setDescription(`**Your hand:** ${handToString(playerHand)} (**${handValue(playerHand)}**)\n**Dealer:** ${handToString([dealerHand[0]], true)}`)
                    .setColor(Colors.DEALER)],
                components: []
            });

            while (handValue(dealerHand) < 17) {
                await sleep(1000);
                dealerHand.push(drawCard(deck));
                await interaction.editReply({
                    embeds: [new EmbedBuilder()
                        .setTitle("🃏 Dealer's Turn")
                        .setDescription(`**Your hand:** ${handToString(playerHand)} (**${handValue(playerHand)}**)\n**Dealer:** ${handToString(dealerHand)}`)
                        .setColor(Colors.DEALER)],
                    components: []
                });
            }

            const playerTotal = handValue(playerHand);
            const dealerTotal = handValue(dealerHand);
            let resultText="", resultColor=Colors.LOSE, points=0, money=0;

            if (playerTotal===21 && playerHand.length===2 && dealerTotal !== 21) {
                resultText="Blackjack!"; resultColor=Colors.BLACKJACK; points=2; money=15;
                user.streakCurrent++; user.wins++; user.blackjacks++; user.rounds++; user.money += money; user.moneyGained += money;
                if (user.streakCurrent > user.streakBest) user.streakBest = user.streakCurrent;
                user.points += points * user.streakCurrent; user.pxp += 15;
            } else if (playerTotal > 21) {
                resultText="Bust! You lose!"; points=-1; money=-10; user.streakCurrent=0; user.losses++; user.rounds++; user.money += money; user.moneyLost += 10; user.points += points;
            } else if (dealerTotal > 21 || playerTotal > dealerTotal) {
                resultText="You win!"; points=1; money=10; user.streakCurrent++; user.wins++; user.rounds++; user.money += money; user.moneyGained += money;
                if (user.streakCurrent > user.streakBest) user.streakBest = user.streakCurrent; user.points += points * user.streakCurrent; user.pxp += 10;
            } else if (playerTotal < dealerTotal) {
                resultText="You lose!"; points=-1; money=-10; user.streakCurrent=0; user.losses++; user.rounds++; user.money += money; user.moneyLost += 10; user.points--;
            } else {
                resultText="Tie!"; points=0; money=0; user.streakCurrent=0; user.ties++; user.rounds++;
            }

            user.moneyNet = user.moneyGained - user.moneyLost;
            await user.save();

            await endGame(interaction, user, playerHand, dealerHand, money, points, resultText, resultColor);
        }

        async function endGame(interaction, user, playerHand, dealerHand, money, points, resultText, resultColor) {
            const playAgainRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder().setCustomId("playAgain").setLabel("Play Again").setStyle(ButtonStyle.Primary)
                );

            await interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setTitle("🏁 Results")
                    .setDescription(
                        `**Your hand:** ${handToString(playerHand)} (**${handValue(playerHand)}**)\n`+
                        `**Dealer:** ${handToString(dealerHand)} (**${handValue(dealerHand)}**)\n\n`+
                        `${resultText}\nMoney Earned: $${money}\nPoints Earned: ${points} (${points} points * ${user.streakCurrent} streak)`
                    )
                    .setColor(resultColor)
                ],
                components: [playAgainRow]
            });

            const playAgainCollector = interaction.channel.createMessageComponentCollector({
                filter: i => i.user.id === user.userId && i.customId === "playAgain",
                max: 1,
                time: 60000
            });

            playAgainCollector.on("collect", async i => {
                playAgainCollector.stop();
                await i.deferUpdate();
                startRound(i, user);
            });
        }
    }
};
