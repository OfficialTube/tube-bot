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
        .setTitle('🎮 Phasmophobia Viewer Games Live Schedule')
        .setColor('#2f3136')
        .setDescription('**Schedule updates dynamically with the streamer\'s real pace.** Lobbies hard-capped at 9 max.');

    let timelinePointerMs = queueStartTimeEpoch * 1000 + (30 * 60 * 1000);

    if (completedGroups.length > 0) {
        let completedText = "";
        completedGroups.forEach((group) => {
            const players = group.players.map(p => `<@${p.id}>`).join(', ');
            const sEpoch = Math.floor(group.timeSetupStart.getTime() / 1000);
            const eEpoch = Math.floor(group.timeOutroEnd.getTime() / 1000);
            completedText += `**Lobby [Finished]:** ${players}\n🔹 *Diff:* ${difficultyLabels[group.difficulty]} | *Duration:* <t:${sEpoch}:t> - <t:${eEpoch}:t>\n\n`;
        });
        embed.addFields({ name: '🏁 Completed Lobbies History', value: completedText });
    }

    if (activeGroup) {
        const players = activeGroup.players.map(p => `<@${p.id}>`).join(', ');
        let currentStatusLabel = "";
        let remainingTimeMs = 0;

        switch (activeGroup.status) {
            case 'setup':
                currentStatusLabel = "Setting Up Lobby";
                remainingTimeMs = (25 * 60 * 1000) - (Date.now() - activeGroup.timeSetupStart.getTime());
                break;
            case 'game1':
                currentStatusLabel = "Game 1 of 2 In Progress";
                remainingTimeMs = (22 * 60 * 1000) - (Date.now() - activeGroup.timeGame1Start.getTime());
                break;
            case 'midgame':
                currentStatusLabel = "Game 1 of 2 Complete";
                remainingTimeMs = (12 * 60 * 1000) - (Date.now() - activeGroup.timeGame1End.getTime());
                break;
            case 'game2':
                currentStatusLabel = "Game 2 of 2 In Progress";
                remainingTimeMs = (11 * 60 * 1000) - (Date.now() - activeGroup.timeGame2Start.getTime());
                break;
            case 'outro':
                currentStatusLabel = "Game 2 of 2 Complete";
                remainingTimeMs = (1 * 60 * 1000) - (Date.now() - activeGroup.timeGame2End.getTime());
                break;
        }

        remainingTimeMs = Math.max(0, remainingTimeMs);
        const startEpoch = Math.floor(activeGroup.timeSetupStart.getTime() / 1000);
        const estEndEpoch = Math.floor((Date.now() + remainingTimeMs) / 1000);

        embed.addFields({ 
            name: `Active Lobby — [${currentStatusLabel}]`, 
            value: `**Users:** ${players}\n**Difficulty:** ${difficultyLabels[activeGroup.difficulty]}\n**Start/End Time:** Started at <t:${startEpoch}:t> | Estimated Finish: <t:${estEndEpoch}:t> (<t:${estEndEpoch}:R>)`, 
        });

        timelinePointerMs = Date.now() + remainingTimeMs;
    }

    if (fullWaiting.length > 0) {
        fullWaiting.forEach((group, index) => {
            const players = group.players.map(p => `<@${p.id}>`).join(', ');
            const startEpoch = Math.floor(timelinePointerMs / 1000);
            timelinePointerMs += (25 * 60 * 1000);
            const endEpoch = Math.floor(timelinePointerMs / 1000);

            embed.addFields({ 
                name: `Queue Position #${index + 1} (Lobby Full)`, 
                value: `**Users:** ${players}\n**Difficulty:** ${difficultyLabels[group.difficulty]}\n**Estimated Start/End Time:** <t:${startEpoch}:t> - <t:${endEpoch}:t> (<t:${startEpoch}:R>)`, 
            });
        });
    }

    if (partialGroups.length > 0) {
        let partialText = "";
        partialGroups.forEach((group) => {
            const players = group.players.map(p => `<@${p.id}>`).join(', ');
            partialText += `**Users:** ${players}\n*Difficulty:* ${difficultyLabels[group.difficulty]} | *Slots Open:* **${3 - group.players.length}**\n\n`;
        });
        embed.addFields({ name: 'Forming Lobbies (Waiting for Backfill)', value: partialText });
    }

    if (fullWaiting.length === 0 && partialGroups.length === 0 && !activeGroup) {
        embed.setDescription('The schedule is empty. Join the queue select dropdown above to spin up a group!');
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
