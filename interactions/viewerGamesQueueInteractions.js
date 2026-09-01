const { ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const ViewerQueue = require('../models/ViewerQueue');
const { refreshSchedule } = require('../utils/queueScheduler');

const userSelections = new Map();
const difficultyLabels = { "1": "Professional", "2": "Nightmare", "3": "0 Sanity, 0 Evidence" };

// Hardcoded Public Channel Tracking Setup
const PUBLIC_QUEUE_CHANNEL_ID = "1430021464056402010"; 

// Active Metadata Configuration Handles
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
            content: `**Selected Schedule Queue Requests:**\n• Game 1/2 Pool: ${difficultyLabels[data.difficulty]}\n• Bonus Game 3/4 Pool: ${difficultyLabels[data.subDifficulty]}\nClick **Confirm** to lock in your placement positions.`, 
            components: [new ActionRowBuilder().addComponents(confirmButton)], 
        });
    } 

    // STEP 5 — User clicks Confirm to join queue(s)
    else if (interaction.customId === "queue_confirm") {
        const data = userSelections.get(userId);
        if (!data || !data.difficulty) return interaction.reply({ content: "No selection session cached.", ephemeral: true });

        const targets = [data.difficulty];
        if (data.subDifficulty) targets.push(data.subDifficulty);

        let successfullyJoinedCount = 0;

        for (const diff of targets) {
            let targetGroup = await ViewerQueue.findOne({ difficulty: diff, isFull: false, "players.id": { $ne: userId } });

            if (!targetGroup) {
                const duplicateCheck = await ViewerQueue.findOne({ difficulty: diff, isFull: false, "players.id": userId });
                if (duplicateCheck) continue;

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
        }

        userSelections.delete(userId);

        if (successfullyJoinedCount === 0) {
            return interaction.update({ content: "❌ **Queue Entry Denied:** The total pool limit is capped at 9 full groups, or you are already waiting in those open difficulties.", components: [] });
        }

        // Live Dynamic Schedule Re-Calculation Call Trigger
        if (liveScheduleMessageId) {
            await refreshSchedule(interaction.client, PUBLIC_QUEUE_CHANNEL_ID, liveScheduleMessageId, liveTargetEpoch);
        } else {
            console.log(`⚠️ Warning: User joined queue, but /lobby set_metadata has not been run by an admin yet.`);
        }

        return interaction.update({ content: `✅ Registered successfully! Your slot listings are saved and visible on the schedule.`, components: [] });
    }
}

// Fixed: Added the missing linkage setter logic explicitly back into the file execution lines
function setScheduleConfig(msgId, targetEpoch) {
    liveScheduleMessageId = msgId;
    liveTargetEpoch = targetEpoch;
}

module.exports = { 
    handleViewerGamesQueueInteractions, 
    setScheduleConfig 
};
