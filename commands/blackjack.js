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

const sleep = ms => new Promise(r => setTimeout(r, ms));

module.exports = {
    data: new SlashCommandBuilder()
        .setName("blackjack")
        .setDescription("Play a game of blackjack!"),
    async execute(interaction) {
        let user = await User.findOne({ userId: interaction.user.id });

        if (!user || user.money < 10) {
            return interaction.reply({
                content: `You do not have enough money to play Blackjack! You need at least $10.`,
                ephemeral: true
            });
        }

        await playRound(interaction, user, true);
    }
};

async function playRound(interaction, user, firstRound = false) {
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

    let msg;
    if (firstRound) {
        msg = await interaction.reply({ embeds: [embed], components: [row], ephemeral: true, fetchReply: true });
    } else {
        msg = await interaction.followUp({ embeds: [embed], components: [row], ephemeral: true, fetchReply: true });
    }

    const collector = msg.createMessageComponentCollector({
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
            await dealerTurn(interaction, i, user, playerHand, dealerHand, deck);
        }
    });
}

async function dealerTurn(interaction, button, user, playerHand, dealerHand, deck) {
    await button.update({
        embeds: [new EmbedBuilder()
            .setTitle("🃏 Dealer's Turn")
            .setDescription(`**Your hand:** ${handToString(playerHand)} (**${handValue(playerHand)}**)\n` +
                            `**Dealer:** ${handToString([dealerHand[0]], true)}`)
            .setColor(Colors.DEALER)],
        components: []
    });

    while(handValue(dealerHand) < 17) {
        await sleep(1000);
        dealerHand.push(drawCard(deck));
        await button.editReply({
            embeds: [new EmbedBuilder()
                .setTitle("🃏 Dealer's Turn")
                .setDescription(`**Your hand:** ${handToString(playerHand)} (**${handValue(playerHand)}**)\n` +
                                `**Dealer:** ${handToString(dealerHand)}`)
                .setColor(Colors.DEALER)],
            components: []
        });
    }

    const playerTotal = handValue(playerHand);
    const dealerTotal = handValue(dealerHand);

    let resultText="", resultColor=Colors.LOSE, points=0, money=0;
    if(playerTotal>21){ resultText="Bust! You lose!"; points=-1; money=-10; }
    else if(playerTotal===21 && playerHand.length===2 && dealerTotal!==21){ resultText="Blackjack!"; points=2; money=15; resultColor=Colors.BLACKJACK; }
    else if(dealerTotal>21 || playerTotal>dealerTotal){ resultText="You win!"; points=1; money=10; resultColor=Colors.WIN; }
    else if(playerTotal<dealerTotal){ resultText="You lose!"; points=-1; money=-10; }
    else { resultText="Tie!"; points=0; money=0; resultColor=Colors.PLAYER; }

    await endGame(interaction, button, user, playerHand, dealerHand, deck, resultText, resultColor, money, points);
}

async function endGame(interaction, button, user, playerHand, dealerHand, deck, resultText, color, money, points) {
    const playAgainRow = new ActionRowBuilder()
        .addComponents(new ButtonBuilder().setCustomId("playAgain").setLabel("Play Again").setStyle(ButtonStyle.Primary));

    await button.editReply({
        embeds: [new EmbedBuilder()
            .setTitle("🏁 Results")
            .setDescription(
                `**Your hand:** ${handToString(playerHand)} (**${handValue(playerHand)}**)\n` +
                `**Dealer:** ${handToString(dealerHand)} (**${handValue(dealerHand)}**)\n\n` +
                `${resultText}\nMoney: $${money}\nPoints: ${points}`
            )
            .setColor(color)
        ],
        components: [playAgainRow]
    });

    const collector = button.channel.createMessageComponentCollector({
        filter: i => i.user.id === interaction.user.id && i.customId === "playAgain",
        time: 60000
    });

    collector.on("collect", async i => {
        collector.stop();
        await i.deferUpdate();
        await playRound(interaction, user, false);
    });
}
