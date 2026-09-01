const ViewerQueue = require('../models/ViewerQueue');
const { EmbedBuilder } = require('discord.js');

const difficultyLabels = { "1": "Professional", "2": "Nightmare", "3": "0 Sanity, 0 Evidence" };

async function refreshSchedule(client, channelId, messageId, queueStartTimeEpoch) {
    if (!messageId || messageId.startsWith("YOUR_")) return;

    const fullWaiting = await ViewerQueue.find({ isFull: true, status: 'waiting' }).sort({ filledAt: 1 });
    const partialGroups = await ViewerQueue.find({ isFull: false }).sort({ createdAt: 1 });
    const completedGroups = await ViewerQueue.find({ status: 'completed' }).sort({ timeOutroEnd: 1 });
    const activeGroup = await ViewerQueue.findOne({ status: { $in: ['setup', 'game1', 'midgame', 'game2', 'outro'] } });

    const embed = new EmbedBuilder()
        .setTitle('Phasmophobia Viewer Games Live Schedule')
        .setColor('#2f3136')
        .setDescription('**Schedule updates dynamically.** There will only be a max of 6 groups allowed.\n‎');

    // Group 1 starts exactly at your designated epoch parameter milestone time
    let timelinePointerMs = queueStartTimeEpoch * 1000;

    // 1. DISPLAY LOGIC: COMPLETED GROUPS
    if (completedGroups.length > 0) {
        let completedText = "";
        completedGroups.forEach((group) => {
            const players = group.players.map(p => `<@${p.id}>`).join(', ');
            const startMs = group.timeSetupStart ? group.timeSetupStart.getTime() : Date.now();
            const endMs = group.timeOutroEnd ? group.timeOutroEnd.getTime() : Date.now();
            
            const sEpoch = Math.floor(startMs / 1000);
            const eEpoch = Math.floor(endMs / 1000);
            completedText += `**Lobby [Finished]:** ${players}\n🔹 *Difficulty:* ${difficultyLabels[group.difficulty]} | *Duration:* <t:${sEpoch}:t> - <t:${eEpoch}:t>\n\n`;
        });
        embed.addFields({ name: 'Completed Lobbies History', value: completedText + '━' });
    }

    // 2. DISPLAY LOGIC: ACTIVE RUNNING GROUP
    if (activeGroup) {
        const players = activeGroup.players.map(p => `<@${p.id}>`).join(', ');
        let currentStatusLabel = "";
        let remainingTimeMs = 0;
        const now = Date.now();

        const setupStart = activeGroup.timeSetupStart ? activeGroup.timeSetupStart.getTime() : now;
        const g1Start = activeGroup.timeGame1Start ? activeGroup.timeGame1Start.getTime() : now;
        const g1End = activeGroup.timeGame1End ? activeGroup.timeGame1End.getTime() : now;
        const g2Start = activeGroup.timeGame2Start ? activeGroup.timeGame2Start.getTime() : now;
        const g2End = activeGroup.timeGame2End ? activeGroup.timeGame2End.getTime() : now;

        switch (activeGroup.status) {
            case 'setup':
                currentStatusLabel = "Setting Up Lobby";
                remainingTimeMs = (25 * 60 * 1000) - (now - setupStart);
                break;
            case 'game1':
                currentStatusLabel = "Game 1 of 2 In Progress";
                remainingTimeMs = (22 * 60 * 1000) - (now - g1Start);
                break;
            case 'midgame':
                currentStatusLabel = "Game 1 of 2 Complete";
                remainingTimeMs = (12 * 60 * 1000) - (now - g1End);
                break;
            case 'game2':
                currentStatusLabel = "Game 2 of 2 In Progress";
                remainingTimeMs = (11 * 60 * 1000) - (now - g2Start);
                break;
            case 'outro':
                currentStatusLabel = "Game 2 of 2 Complete";
                remainingTimeMs = (1 * 60 * 1000) - (now - g2End);
                break;
        }

        // Persistent safe clamp handles live overtime drift adjustments automatically
        if (remainingTimeMs < 0) remainingTimeMs = 0; 

        const startEpoch = Math.floor(setupStart / 1000);
        const estEndEpoch = Math.floor((now + remainingTimeMs) / 1000);

        embed.addFields({ 
            name: `Active Lobby — [${currentStatusLabel}]`, 
            value: `**Users:** ${players}\n**Difficulty:** ${difficultyLabels[activeGroup.difficulty]}\n**Start/End Time:** Started at <t:${startEpoch}:t> | Estimated Finish: <t:${estEndEpoch}:t> (<t:${estEndEpoch}:R>)\n\n🔹 *Next lobbies start right after this group.*`, 
        });

        timelinePointerMs = now + remainingTimeMs;
    }

    // 3. DISPLAY LOGIC: FUTURE RESERVED WAITING GROUPS (With Spacing Dividers)
    if (fullWaiting.length > 0) {
        fullWaiting.forEach((group, index) => {
            const players = group.players.map(p => `<@${p.id}>`).join(', ');
            const startEpoch = Math.floor(timelinePointerMs / 1000);
            
            timelinePointerMs += (25 * 60 * 1000);
            const endEpoch = Math.floor(timelinePointerMs / 1000);

            // Added clean visual space breaker sequence (\n\u200B) to stop text smushing 
            embed.addFields({ 
                name: `Queue Position #${index + 1} (Lobby Full)`, 
                value: `**Users:** ${players}\n**Difficulty:** ${difficultyLabels[group.difficulty]}\n**Estimated Start/End Time:** <t:${startEpoch}:t> - <t:${endEpoch}:t> (<t:${startEpoch}:R>)\n\u200B`, 
            });
        });
    }

    // 4. DISPLAY LOGIC: PARTIAL FORMING GROUPS
    if (partialGroups.length > 0) {
        let partialText = "";
        partialGroups.forEach((group) => {
            const players = group.players.map(p => `<@${p.id}>`).join(', ');
            partialText += `**Users:** ${players}\n*Difficulty:* ${difficultyLabels[group.difficulty]} | *Slots Open:* **${3 - group.players.length}**\n\n`;
        });
        embed.addFields({ name: 'Lobbies with open slots', value: partialText });
    }

    if (fullWaiting.length === 0 && partialGroups.length === 0 && !activeGroup) {
        embed.setDescription('Join the queue using the dropdown menu below!');
    }

    try {
        const channel = await client.channels.fetch(channelId);
        const msg = await channel.messages.fetch(messageId);
        await msg.edit({ embeds: [embed] });
    } catch (err) {
        console.error("Schedule message update failed:", err);
    }
}

module.exports = { refreshSchedule };
