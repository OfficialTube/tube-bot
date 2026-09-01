const { ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const ViewerQueue = require('../models/ViewerQueue');
const { refreshSchedule } = require('../utils/queueScheduler');

const userSelections = new Map();
const difficultyLabels = { "1": "Professional", "2": "Nightmare", "3": "0 Sanity, 0 Evidence" };

const PUBLIC_QUEUE_CHANNEL_ID = "1430021464056402010"; 

let liveScheduleMessageId = null;
let liveTargetEpoch = 0;

async function handleViewerGamesQueueInteractions(interaction) {
    if (!interaction.isButton() && !interaction.isStringSelectMenu()) return;

    const userId = interaction.user.id;
    const username = interaction.user.username;
    const twitchSubRoleId = "1422737505257783447"; 

    // STEP 1 — User selects main difficulty
    if (interaction.customId === "queue_difficulty") {
        const diff = interaction.values[0]; 
        userSelections.set(userId, { difficulty: diff });
        const nextButton = new ButtonBuilder().setCustomId("queue_next").setLabel("Next").setStyle(ButtonStyle.Success);
        
        return interaction.reply({ 
            content: `You selected: **${difficultyLabels[diff]}**.\nClick **Next** to continue.`, 
            components: [new ActionRowBuilder().addComponents(nextButton)], 
            ephemeral: true, 
        }).catch(() => {
            return interaction.update({
                content: `You updated selection to: **${difficultyLabels[diff]}**.\nClick **Next** to continue.`, 
                components: [new ActionRowBuilder().addComponents(nextButton)], 
            });
        });
    } 

    // STEP 2 — User clicks Next
    else if (interaction.customId === "queue_next") {
        const userData = userSelections.get(userId);
        if (!userData || !userData.difficulty) {
            return interaction.reply({ content: "⚠️ Please select a difficulty before clicking Next.", ephemeral: true });
        }

        if (interaction.member.roles.cache.has(twitchSubRoleId)) {
            const subMenu = new StringSelectMenuBuilder()
                .setCustomId("sub_queue_difficulty")
                .setPlaceholder("Select your subscriber bonus game difficulty")
                .addOptions([{ label: "Professional", value: "1" }, { label: "Nightmare", value: "2" }, { label: "0 Sanity, 0 Evidence", value: "3" }]);
            return interaction.update({ 
                content: "🎉 **Twitch Subscriber Perk!** Select your secondary bonus lobby difficulty below:", 
                components: [new ActionRowBuilder().addComponents(subMenu)], 
            });
        } else {
            const confirmButton = new ButtonBuilder().setCustomId("queue_confirm").setLabel("Confirm").setStyle(ButtonStyle.Primary);
            return interaction.update({ 
                content: `**Selected Difficulty:** ${difficultyLabels[userData.difficulty]}\nClick **Confirm** to lock in your queue slot placement.`, 
                components: [new ActionRowBuilder().addComponents(confirmButton)], 
            });
        }
    } 

    // STEP 3 — Subscriber selects bonus difficulty
    else if (interaction.customId === "sub_queue_difficulty") {
        const diff = interaction.values[0]; 
        const current = userSelections.get(userId) || {};
        current.subDifficulty = diff;
        userSelections.set(userId, current);

        const nextSubButton = new ButtonBuilder().setCustomId("queue_next_sub").setLabel("Next").setStyle(ButtonStyle.Success);
        return interaction.update({ 
            content: `Selected bonus difficulty: **${difficultyLabels[diff]}**.\nClick **Next** to proceed to final verification.`, 
            components: [new ActionRowBuilder().addComponents(nextSubButton)], 
        });
    } 

    // STEP 4 — Subscriber clicks Next to confirm both
    else if (interaction.customId === "queue_next_sub") {
        const data = userSelections.get(userId);
        const confirmButton = new ButtonBuilder().setCustomId("queue_confirm").setLabel("Confirm").setStyle(ButtonStyle.Primary);
        return interaction.update({ 
            content: `**Selected Schedule Queue Requests:**\n• Games: ${difficultyLabels[data.difficulty]}\n• Bonus Games: ${difficultyLabels[data.subDifficulty]}\nClick **Confirm** to confirm your spots in the queue.`, 
            components: [new ActionRowBuilder().addComponents(confirmButton)], 
        });
    } 

    // STEP 5 — User clicks Confirm to join queue(s)
    else if (interaction.customId === "queue_confirm") {
        const data = userSelections.get(userId);
        if (!data || !data.difficulty) return interaction.reply({ content: "No selection session cached.", ephemeral: true });

        // Fetch all incomplete active groups from the DB to evaluate them cleanly
        const activeGroups = await ViewerQueue.find({ status: { $ne: 'completed' } });
        
        // Count entries manually via code logic to eliminate sub-document tracking bugs
        let activeUserGroupsCount = 0;
        activeGroups.forEach(g => {
            if (g.players.some(p => p.id === userId)) {
                activeUserGroupsCount++;
            }
        });

        const hasSubRole = interaction.member.roles.cache.has(twitchSubRoleId);
        const maxAllowedGroups = hasSubRole ? 2 : 1;

        if (activeUserGroupsCount >= maxAllowedGroups) {
            userSelections.delete(userId);
            return interaction.update({ 
                content: `❌ **Queue Entry Denied:** You are already waiting in the maximum allowed number of groups (**${maxAllowedGroups}**) for your rank tier.`, 
                components: [] 
            });
        }

        const choices = [{ diff: data.difficulty, isBonus: false }];
        if (data.subDifficulty && hasSubRole) {
            choices.push({ diff: data.subDifficulty, isBonus: true });
        }

        let successfullyJoinedCount = 0;

        for (let i = 0; i < choices.length; i++) {
            const currentChoice = choices[i];
            const diff = currentChoice.diff;

            // Look for an unfilled group for this difficulty
            let targetGroup = await ViewerQueue.findOne({ difficulty: diff, isFull: false });

            // If an unfilled group exists but they are already in it, don't double join the same exact document
            if (targetGroup && targetGroup.players.some(p => p.id === userId)) {
                continue;
            }

            if (!targetGroup) {
                // Check if they are already inside ANY open group for this specific difficulty to prevent exploit spamming
                const holdsDuplicateSlot = activeGroups.some(g => g.difficulty === diff && g.isFull === false && g.players.some(p => p.id === userId));
                if (holdsDuplicateSlot && (!currentChoice.isBonus || data.difficulty !== data.subDifficulty)) {
                    continue; 
                }

                // Global limit enforcement check
                const totalGroupsExistCount = await ViewerQueue.countDocuments();
                if (totalGroupsExistCount >= 9) continue; 

                targetGroup = new ViewerQueue({ difficulty: diff, players: [] });
            }

            targetGroup.players.push({ id: userId, username });
            
            if (targetGroup.players.length >= 3) {
                targetGroup.isFull = true;
                targetGroup.filledAt = new Date(); 
            }

            await targetGroup.save();
            successfullyJoinedCount++;
            
            if ((activeUserGroupsCount + successfullyJoinedCount) >= maxAllowedGroups) {
                break;
            }
        }

        userSelections.delete(userId);

        if (successfullyJoinedCount === 0) {
            return interaction.update({ content: "❌ **Queue Entry Denied:** The total groups limit is capped at 9 full groups, or you are already waiting in those difficulties.", components: [] });
        }

        // Trigger dynamic message re-render logic instantly
        if (liveScheduleMessageId) {
            await refreshSchedule(interaction.client, PUBLIC_QUEUE_CHANNEL_ID, liveScheduleMessageId, liveTargetEpoch);
        } else {
            console.log(`⚠️ Warning: User joined queue, but /lobby set_metadata has not been run by an admin yet.`);
        }

        return interaction.update({ content: `✅ Registered successfully! Keep an eye on the schedule and your DMs!`, components: [] });
    }
}

function setScheduleConfig(msgId, targetEpoch) {
    liveScheduleMessageId = msgId;
    liveTargetEpoch = targetEpoch;
}

module.exports = { 
    handleViewerGamesQueueInteractions, 
    setScheduleConfig 
};
