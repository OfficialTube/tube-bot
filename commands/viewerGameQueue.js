const { SlashCommandBuilder } = require('discord.js');
const QueueSchedule = require('../models/QueueSchedule');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('openqueue')
        .setDescription('Open up a queue for Phasmophobia Viewer Games (admin only)')
        .addStringOption(option => option
            .setName('timestamp')
            .setDescription('Epoch timestamp for when the queue should open.')
            .setRequired(true)
        ),
    async execute(interaction) {
        if(!interaction.member.roles.cache.has('1379719761075900468')) {
            return interaction.reply({content: 'You do not have permissions to use this command.', ephemeral: true});
        }

        const rawTimestamp = interaction.options.getString('timestamp').trim();
        const epoch = parseInt(rawTimestamp, 10);

        if (isNaN(epoch)) {
            return interaction.reply({ content: '❌ Invalid epoch timestamp number format.', ephemeral: true });
        }

        const targetSendTime = new Date(epoch * 1000);
        const delay = targetSendTime.getTime() - Date.now();

        if (delay <= 0) {
            return interaction.reply({ content: '❌ That time is in the past.', ephemeral: true });
        }

        // Wipe any old stuck or un-deployed schedules to prevent overlapping double drops
        await QueueSchedule.deleteMany({ isDeployed: false });

        // Save safely directly onto disk space
        const newSchedule = new QueueSchedule({
            epoch: epoch,
            targetSendTime: targetSendTime
        });
        await newSchedule.save();

        return interaction.reply({ 
            content: `✅ **Queue Schedule Secured!** The background engine will safely open the queue channel at <t:${epoch}:f>, even if the bot restarts or goes offline in the meantime.`, 
            ephemeral: true 
        });
    },
};
