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
        if (!card) continue; // Safety check
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
                content: `You do not have enough money to play Blackjack! You need at least $10! Chat to earn money. Check your balance with \`/rank\`.`,
                ephemeral: true
            });
        }

        playRound(interaction, user, true);
    }
};

async function playRound(interaction, user, firstGame) {
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

    // Send initial message or follow-up if not first game
    if (firstGame) {
        await interaction.reply({ embeds: [embed], components: [buttonsRow], ephemeral: true });
    } else {
        await interaction.followUp({ embeds: [embed], components: [buttonsRow], ephemeral: true });
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
                await endGame(interaction, i, user, playerHand, dealerHand, deck, "Bust! You lose!", Colors.LOSE, -10, -1);
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
            await dealerTurn(interaction, i, user, playerHand, dealerHand, deck);
        }
    });
}

async function dealerTurn(interaction, button, user, playerHand, dealerHand, deck) {
    // Acknowledge button
    if (!button.deferred && !button.replied) await button.deferUpdate();

    // Dealer draws until 17
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

    // Determine result
    const playerTotal = handValue(playerHand);
    const dealerTotal = handValue(dealerHand);
    let resultText="", resultColor=Colors.LOSE, points=0, money=0;

    if (playerTotal === 21 && playerHand.length === 2 && dealerTotal !== 21) {
        resultText = "Blackjack!";
        resultColor = Colors.BLACKJACK;
        points = 2;
        money = 15;
        user.streakCurrent++;
        user.wins++;
        user.blackjacks++;
    } else if (playerTotal > 21 || playerTotal < dealerTotal && dealerTotal <= 21) {
        resultText = "You lose!";
        resultColor = Colors.LOSE;
        points = -1;
        money = -10;
        user.streakCurrent = 0;
        user.losses++;
    } else if (dealerTotal > 21 || playerTotal > dealerTotal) {
        resultText = "You win!";
        resultColor = Colors.WIN;
        points = 1;
        money = 10;
        user.streakCurrent++;
        user.wins++;
    } else {
        resultText = "Tie!";
        resultColor = Colors.PLAYER;
        points = 0;
        money = 0;
        user.streakCurrent = 0;
        user.ties++;
    }

    user.money += money;
    user.rounds++;
    user.moneyGained += money > 0 ? money : 0;
    user.moneyLost += money < 0 ? Math.abs(money) : 0;
    user.moneyNet = user.moneyGained - user.moneyLost;
    user.points += points * user.streakCurrent;
    if (user.streakCurrent > user.streakBest) user.streakBest = user.streakCurrent;
    await user.save();

    // Show results and Play Again button
    await endGame(interaction, button, user, playerHand, dealerHand, deck, resultText, resultColor, money, points * user.streakCurrent);
}

async function endGame(interaction, button, user, playerHand, dealerHand, deck, resultText, color, money, points) {
    const playAgainRow = new ActionRowBuilder()
        .addComponents(new ButtonBuilder().setCustomId("playAgain").setLabel("Play Again").setStyle(ButtonStyle.Primary));

    // Ensure the interaction is acknowledged
    if (!button.replied && !button.deferred) await button.deferUpdate();

    await button.editReply({
        embeds: [new EmbedBuilder()
            .setTitle("🏁 Results")
            .setDescription(`**Your hand:** ${handToString(playerHand)} (**${handValue(playerHand)}**)\n**Dealer:** ${handToString(dealerHand)} (**${handValue(dealerHand)}**)\n\n${resultText}\nMoney: $${money}\nPoints: ${points}`)
            .setColor(color)
        ],
        components: [playAgainRow]
    });

    const collector = button.channel.createMessageComponentCollector({
        filter: i => i.user.id === user.userId && i.customId === "playAgain",
        time: 60000
    });

    collector.on("collect", async i => {
        collector.stop();
        await i.deferUpdate();
        await playRound(interaction, user, false);
    });
}
