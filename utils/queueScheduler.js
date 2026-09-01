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
        .setColor(0x2f3136)
        .setDescription('**Schedule updates dynamically with the streamer\'s real pace.** Lobbies hard-capped at 9 max.');

    // Initialize baseline starting timeline pointer (Queue open time + 30 mins)
    let timelinePointerMs = queueStartTimeEpoch * 1000 + (30 * 60 * 1000);

    // 1. DISPLAY LOGIC: COMPLETED GROUPS
    if (completedGroups.length > 0) {
        let completedText = "";
        completedGroups.forEach((group) => {
            const players = group.players.map(p => `<@${p.id}>`).join(', ');
            const sEpoch = Math.floor(group.timeSetupStart.getTime() / 1000);
            const eEpoch = Math.floor(group.timeOutroEnd.getTime() / 1000);
            completedText += `✅ **Lobby [Finished]:** ${players}\n🔹 *Diff:* ${difficultyLabels[group.difficulty]} | *Duration:* <t:${sEpoch}:t> - <t:${eEpoch}:t>\n\n`;
        });
        embed.addFields({ name: '🏁 Completed Lobbies History', value: completedText });
    }

    // 2. TIMING CALCULATIONS & DISPLAY LOGIC: ACTIVE RUNNING GROUP
    if (activeGroup) {
        const players = activeGroup.players.map(p => `<@${p.id}>`).join(', ');
        let currentStatusLabel = "";
        let remainingTimeMs = 0;

        // Dynamic time remaining assessment based on step triggers
        switch (activeGroup.status) {
            case 'setup':
                currentStatusLabel = "📥 Getting Code & Loading In";
                // 3m setup + 10m g1 + 1m mid + 10m g2 + 1m outro = 25m total remaining
                remainingTimeMs = (25 * 60 * 1000) - (Date.now() - activeGroup.timeSetupStart.getTime());
                break;
            case 'game1':
                currentStatusLabel = "👻 Game 1/2 In Progress";
                // 10m g1 + 1m mid + 10m g2 + 1m outro = 22m total remaining from game 1 start
                remainingTimeMs = (22 * 60 * 1000) - (Date.now() - activeGroup.timeGame1Start.getTime());
                break;
            case 'midgame':
                currentStatusLabel = "☕ Mid-Game Banter & Review";
                // 1m mid + 10m g2 + 1m outro = 12m remaining
                remainingTimeMs = (12 * 60 * 1000) - (Date.now() - activeGroup.timeGame1End.getTime());
                break;
            case 'game2':
                currentStatusLabel = "💀 Game 2/2 In Progress";
                // 10m g2 + 1m outro = 11m remaining
                remainingTimeMs = (11 * 60 * 1000) - (Date.now() - activeGroup.timeGame2Start.getTime());
                break;
            case 'outro':
                currentStatusLabel = "👋 Saying Goodbyes / Outro Wrap";
                // 1m outro remaining
                remainingTimeMs = (1 * 60 * 1000) - (Date.now() - activeGroup.timeGame2End.getTime());
                break;
        }

        // Clamp safety margin
        remainingTimeMs = Math.max(0, remainingTimeMs);
        const startEpoch = Math.floor(activeGroup.timeSetupStart.getTime() / 1000);
        const estEndEpoch = Math.floor((Date.now() + remainingTimeMs) / 1000);

        embed.addFields({
            name: `🎬 Active Stream Lobby — [${currentStatusLabel}]`,
            value: `👥 **Lineup:** ${players}\n💀 **Difficulty:** ${difficultyLabels[activeGroup.difficulty]}\n⏱️ **Block Timeline:** Started at <t:${startEpoch}:t> | Est. Outro Finish: <t:${estEndEpoch}:t> (<t:${estEndEpoch}:R>)`,
        });

        // Set the timetable pointer for all upcoming future groups to chain right after this calculated dynamic end
        timelinePointerMs = Date.now() + remainingTimeMs;
    }

    // 3. DISPLAY LOGIC: FUTURE RESERVED WAITING GROUPS (Chained 25-minute slots)
    if (fullWaiting.length > 0) {
        fullWaiting.forEach((group, index) => {
            const players = group.players.map(p => `<@${p.id}>`).join(', ');
            const startEpoch = Math.floor(timelinePointerMs / 1000);
            
            // Advance block exactly 25 minutes forward for clean alignment
            timelinePointerMs += (25 * 60 * 1000);
            const endEpoch = Math.floor(timelinePointerMs / 1000);

            embed.addFields({
                name: `⏳ Queue Position #${index + 1} (Lobby Full)`,
                value: `👥 **Lineup:** ${players}\n💀 **Difficulty:** ${difficultyLabels[group.difficulty]}\n⏰ **Estimated Window:** <t:${startEpoch}:t> - <t:${endEpoch}:t> (<t:${startEpoch}:R>)`,
            });
        });
    }

    // 4. DISPLAY LOGIC: PARTIAL FORMING GROUPS
    if (partialGroups.length > 0) {
        let partialText = "";
        partialGroups.forEach((group) => {
            const players = group.players.map(p => `<@${p.id}>`).join(', ');
            partialText += `👥 **Players:** ${players}\n💀 *Difficulty:* ${difficultyLabels[group.difficulty]} | 🪟 *Slots Open:* **${3 - group.players.length}**\n\n`;
        });
        embed.addFields({ name: '📂 Forming Lobbies (Waiting for Backfill)', value: partialText });
    }

    if (fullWaiting.length === 0 && partialGroups.length === 0 && !activeGroup) {
        embed.setDescription('❌ The schedule is empty. Join the queue select dropdown above to spin up a group!');
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
