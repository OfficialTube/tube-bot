const { ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const ViewerQueue = require('../models/ViewerQueue');

// Tracks user selections in memory
const userSelections = new Map();
const difficultyLabels = {
    "1": "Professional",
    "2": "Nightmare",
    "3": "0 Sanity, 0 Evidence",
};

async function handleViewerGamesQueueInteractions(interaction) {
    if (!interaction.isButton() && !interaction.isStringSelectMenu()) return;

    const userId = interaction.user.id;
    const username = interaction.user.username;
    const twitchSubRoleId = "1422737505257783447"; 

    // STEP 1 — User selects main difficulty
    if (interaction.customId === "queue_difficulty") {
        const diff = interaction.values[0];
        userSelections.set(userId, { difficulty: diff });

        const nextButton = new ButtonBuilder()
            .setCustomId("queue_next")
            .setLabel("Next")
            .setStyle(ButtonStyle.Success);

        const buttonRow = new ActionRowBuilder().addComponents(nextButton);

        // Changed to update so users can change their dropdown pick without crashing the bot
        return interaction.reply({ 
            content: `You selected: **${difficultyLabels[diff]}**.\nClick **Next** to continue.`, 
            components: [buttonRow], 
            ephemeral: true, 
        }).catch(() => {
            // Fallback if they select a dropdown twice in the ephemeral state
            return interaction.update({
                content: `You updated selection to: **${difficultyLabels[diff]}**.\nClick **Next** to continue.`, 
                components: [buttonRow], 
            });
        });
    } 

    // STEP 2 — User clicks Next after selecting main difficulty
    else if (interaction.customId === "queue_next") {
        const userData = userSelections.get(userId);
        if (!userData || !userData.difficulty) {
            return interaction.reply({ 
                content: "⚠️ Please select a difficulty before clicking Next.", 
                ephemeral: true, 
            });
        }

        const hasSub = interaction.member.roles.cache.has(twitchSubRoleId);
        if (hasSub) {
            // Subscriber bonus game flow
            const subMenu = new StringSelectMenuBuilder()
                .setCustomId("sub_queue_difficulty")
                .setPlaceholder("Select your bonus game difficulty")
                .addOptions([
                    { label: "Professional", value: "1" },
                    { label: "Nightmare", value: "2" },
                    { label: "0 Sanity, 0 Evidence", value: "3" },
                ]);

            const row = new ActionRowBuilder().addComponents(subMenu);
            return interaction.update({ 
                content: "🎉 Since you're a **Twitch Subscriber**, you get to play **2 extra games!**\nSelect your **bonus difficulty** below, then click **Next**.", 
                components: [row], 
            });
        } else {
            // Non-subscriber → confirm single difficulty
            const confirmButton = new ButtonBuilder()
                .setCustomId("queue_confirm")
                .setLabel("Confirm")
                .setStyle(ButtonStyle.Primary);

            const row = new ActionRowBuilder().addComponents(confirmButton);
            return interaction.update({ 
                content: `**Selected Difficulty:** ${difficultyLabels[userData.difficulty]}\nClick **Confirm** to join the queue.`, 
                components: [row], 
            });
        }
    } 

    // STEP 3 — Subscriber selects bonus difficulty
    else if (interaction.customId === "sub_queue_difficulty") {
        const diff = interaction.values[0];
        const current = userSelections.get(userId) || {};
        current.subDifficulty = diff;
        userSelections.set(userId, current);

        const nextSubButton = new ButtonBuilder()
            .setCustomId("queue_next_sub")
            .setLabel("Next")
            .setStyle(ButtonStyle.Success);

        const buttonRow = new ActionRowBuilder().addComponents(nextSubButton);
        return interaction.update({ 
            content: `Selected bonus difficulty: **${difficultyLabels[diff]}**.\nClick **Next** to continue.`, 
            components: [buttonRow], 
        });
    } 

    // STEP 4 — Subscriber clicks Next to confirm both difficulties
    else if (interaction.customId === "queue_next_sub") {
        const data = userSelections.get(userId);
        if (!data || !data.difficulty || !data.subDifficulty) {
            return interaction.reply({ 
                content: "⚠️ Please make sure you've selected both difficulties first.", 
                ephemeral: true, 
            });
        }

        const confirmButton = new ButtonBuilder()
            .setCustomId("queue_confirm")
            .setLabel("Confirm")
            .setStyle(ButtonStyle.Primary);

            const row = new ActionRowBuilder().addComponents(confirmButton);
        return interaction.update({ 
            content: `**Selected Difficulties:**\n• ${difficultyLabels[data.difficulty]}\n• ${difficultyLabels[data.subDifficulty]}\nClick **Confirm** to join the queue.`, 
            components: [row], 
        });
    } 

    // STEP 5 — User clicks Confirm to join queue(s)
    else if (interaction.customId === "queue_confirm") {
        const data = userSelections.get(userId);
        if (!data || !data.difficulty) {
            return interaction.reply({ content: "No difficulty selection found.", ephemeral: true });
        }

        const allDiffs = [data.difficulty];
        if (data.subDifficulty) allDiffs.push(data.subDifficulty);

        for (const diff of allDiffs) {
            // Find a lobby that has open space AND where this user is not already listed
            let queueGroup = await ViewerQueue.findOne({ 
                difficulty: diff, 
                isFull: false,
                "players.id": { $ne: userId } 
            });

            // If no open group exists without them, look if they are already in an unfilled group
            if (!queueGroup) {
                const alreadyInAnOpenQueue = await ViewerQueue.findOne({ difficulty: diff, isFull: false, "players.id": userId });
                
                // If they are already waiting in a queue group for this difficulty, skip making a duplicate one
                if (alreadyInAnOpenQueue) continue; 

                // Otherwise, create a totally fresh group
                queueGroup = new ViewerQueue({ difficulty: diff, players: [] });
            }

            queueGroup.players.push({ id: userId, username });
            
            // Phasmophobia handles 1 runner (Streamer) + 3 viewers = 4 player lobby total
            if (queueGroup.players.length >= 3) {
                queueGroup.isFull = true;
            }

            await queueGroup.save();
        }

        userSelections.delete(userId);
        return interaction.update({ 
            content: `✅ You’ve been added to the queue${data.subDifficulty ? " for both games!" : "!"}`, 
            components: [], 
        });
    }
}

module.exports = { handleViewerGamesQueueInteractions };
