const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const User = require("../models/User");

function createDeck() {
    const suits = ["♠", "♥", "♦", "♣"];
    const values = [
        { value: "A", points: 11 },
        { value: "2", points: 2 },
        { value: "3", points: 3 },
        { value: "4", points: 4 },
        { value: "5", points: 5 },
        { value: "6", points: 6 },
        { value: "7", points: 7 },
        { value: "8", points: 8 },
        { value: "9", points: 9 },
        { value: "10", points: 10 },
        { value: "J", points: 10 },
        { value: "Q", points: 10 },
        { value: "K", points: 10 }
    ];

    const deck = [];
    for (const suit of suits)
        for (const val of values)
            deck.push({ suit, value: val.value, points: val.points });

    return deck.sort(() => Math.random() - 0.5);
}

function calculateHand(hand) {
    let total = hand.reduce((sum, c) => sum + c.points, 0);
    let aces = hand.filter(c => c.value === "A").length;
    while (total > 21 && aces > 0) {
        total -= 10;
        aces--;
    }
    return total;
}

function handToString(hand, hideSecond = false) {
    return hand
        .map((c, i) => (hideSecond && i === 1 ? "[??]" : `${c.value}${c.suit}`))
        .join(" · ");
}

async function startGame(interaction, user) {
    const deck = createDeck();
    const playerHand = [deck.pop(), deck.pop()];
    const dealerHand = [deck.pop(), deck.pop()];

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("hit").setLabel("Hit").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("stand").setLabel("Stand").setStyle(ButtonStyle.Secondary)
    );

    const embed = new EmbedBuilder()
        .setTitle("🃏 Blackjack")
        .setDescription(
            `**Your Hand:** ${handToString(playerHand)} (**${calculateHand(playerHand)}**)\n` +
            `**Dealer:** ${handToString(dealerHand, true)}`
        )
        .setColor(0x2b2d31);

    const reply = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });

    const collector = reply.createMessageComponentCollector({
        filter: i => i.user.id === interaction.user.id,
        time: 60000
    });

    collector.on("collect", async i => {
        await i.deferUpdate();

        if (i.customId === "hit") {
            playerHand.push(deck.pop());
            const total = calculateHand(playerHand);

            if (total > 21) {
                await endGame(interaction, user, playerHand, dealerHand, "bust");
                collector.stop();
                return;
            }

            const newEmbed = EmbedBuilder.from(embed)
                .setDescription(
                    `**Your Hand:** ${handToString(playerHand)} (**${total}**)\n` +
                    `**Dealer:** ${handToString(dealerHand, true)}`
                );
            await interaction.editReply({ embeds: [newEmbed], components: [row] });
        }

        if (i.customId === "stand") {
            collector.stop();
            await dealerTurn(interaction, user, playerHand, dealerHand, deck);
        }
    });

    collector.on("end", async collected => {
        if (collected.size === 0) {
            await interaction.editReply({ components: [] });
        }
    });
}

async function dealerTurn(interaction, user, playerHand, dealerHand, deck) {
    let dealerTotal = calculateHand(dealerHand);
    const playerTotal = calculateHand(playerHand);

    const updateEmbed = async (desc) => {
        const embed = new EmbedBuilder()
            .setTitle("🃏 Dealer's Turn")
            .setDescription(desc)
            .setColor(0x9b59b6);
        await interaction.editReply({ embeds: [embed], components: [] });
    };

    while (dealerTotal < 17) {
        dealerHand.push(deck.pop());
        dealerTotal = calculateHand(dealerHand);
        await updateEmbed(
            `**Your Hand:** ${handToString(playerHand)} (**${playerTotal}**)\n` +
            `**Dealer:** ${handToString(dealerHand)} (**${dealerTotal}**)`
        );
        await new Promise(res => setTimeout(res, 1000));
    }

    let result = "";
    if (dealerTotal > 21) result = "dealer_bust";
    else if (dealerTotal > playerTotal) result = "dealer_win";
    else if (dealerTotal < playerTotal) result = "player_win";
    else result = "tie";

    await endGame(interaction, user, playerHand, dealerHand, result);
}

async function endGame(interaction, user, playerHand, dealerHand, result) {
    const playerTotal = calculateHand(playerHand);
    const dealerTotal = calculateHand(dealerHand);

    let resultText = "";
    switch (result) {
        case "bust": resultText = "💥 You busted! Dealer wins."; break;
        case "dealer_bust": resultText = "🎉 Dealer busted! You win!"; break;
        case "dealer_win": resultText = "😞 Dealer wins!"; break;
        case "player_win": resultText = "🏆 You win!"; break;
        case "tie": resultText = "🤝 It's a tie!"; break;
    }

    const embed = new EmbedBuilder()
        .setTitle("🏁 Game Over")
        .setDescription(
            `${resultText}\n\n` +
            `**Your Hand:** ${handToString(playerHand)} (**${playerTotal}**)\n` +
            `**Dealer:** ${handToString(dealerHand)} (**${dealerTotal}**)`
        )
        .setColor(0x5865f2);

    const playAgainRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("playAgain").setLabel("Play Again").setStyle(ButtonStyle.Success)
    );

    await interaction.editReply({ embeds: [embed], components: [playAgainRow] });

    const collector2 = interaction.channel.createMessageComponentCollector({
        filter: i => i.user.id === interaction.user.id && i.customId === "playAgain",
        time: 60000
    });

    collector2.on("collect", async b => {
        await b.deferUpdate();

        // clear the old game before restarting
        await interaction.editReply({ embeds: [], components: [] });

        // restart a new game cleanly
        startGame(interaction, user);
    });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("blackjack")
        .setDescription("Play a game of Blackjack!"),
    async execute(interaction) {
        const user = await User.findOne({ userId: interaction.user.id });
        if (!user) return interaction.reply({ content: "You need a profile first!", ephemeral: true });

        await startGame(interaction, user);
    }
};
