const { EmbedBuilder, StringSelectMenuBuilder, ActionRowBuilder } = require('discord.js');
const QueueSchedule = require('../models/QueueSchedule');

function startScheduleChecker(client) {
    setInterval(async () => {
        try {
            const now = new Date();
            // Look for a schedule whose target time has arrived and hasn't been deployed yet
            const pendingSchedule = await QueueSchedule.findOne({ 
                targetSendTime: { $lte: now }, 
                isDeployed: false 
            });

            if (!pendingSchedule) return;

            // Immediately mark it as deployed so it doesn't double-fire
            pendingSchedule.isDeployed = true;
            await pendingSchedule.save();

            const queueChannelId = '1430021464056402010';
            const queueChannel = await client.channels.fetch(queueChannelId);
            if (!queueChannel) return console.error("❌ Schedule Checker: Target channel could not be found.");

            // 1. Send the schedule embed FIRST so it stays pinned at the top
            const initialEmbed = new EmbedBuilder()
                .setTitle('Phasmophobia Viewer Games Live Schedule')
                .setColor('#2f3136')
                .setDescription('The queue is now officially open! Select a difficulty below to join the queue.');

            const scheduleMessage = await queueChannel.send({ embeds: [initialEmbed] });

            // 2. Send your original dropdown prompt right underneath it
            const difficultyMenu = new StringSelectMenuBuilder()
                .setCustomId('queue_difficulty')
                .setPlaceholder('Select Difficulty')
                .addOptions([
                    { label: 'Professional', value: '1' },
                    { label: 'Nightmare', value: '2' },
                    { label: '0 Sanity, 0 Evidence', value: '3' },
                ]);

            const row = new ActionRowBuilder().addComponents(difficultyMenu);

            await queueChannel.send({ 
                content: '# __Join the Phasmophobia Viewer Games Queue__\n\nSelect which difficulty you would like to play on.', 
                components: [row], 
            });

            // 3. Print verification safely into your logging console
            console.log(`=========================================`);
            console.log(`🚨 LIVE SCHEDULE DEPLOYED VIA CLOCK ENGINE!`);
            console.log(`Message ID: ${scheduleMessage.id}`);
            console.log(`Target Epoch: ${pendingSchedule.epoch}`);
            console.log(`=========================================`);

        } catch (error) {
            console.error("❌ Error running background schedule heartbeat:", error);
        }
    }, 10000); // Pulse check every 10 seconds
}

module.exports = { startScheduleChecker };
