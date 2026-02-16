const { SlashCommandBuilder } = require('discord.js');
const ScheduledMessage = require('../models/ScheduledMessages');
const OWNER_ID = '464597977798017024';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('schedule')
        .setDescription('Schedule a message in a channel')
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('Channel to send the message')
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option.setName('unix')
                .setDescription('Unix timestamp in seconds')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('message')
                .setDescription('Message content (roles allowed)')
                .setRequired(true)
        ),
    async execute(interaction)
    {
        if(interaction.user.id !== OWNER_ID)
        {
            return interaction.reply({
                content: 'You are not allowed to use this command.',
                ephemeral: true
            });
        }

        const channel = interaction.options.getChannel('channel');
        const message = interaction.options.getString('message');
        const unix = interaction.options.getInteger('unix');

        if(unix.toString().length !== 10)
        {
            return interaction.reply({
                content: 'Provide a Unix timestamp in seconds.',
                ephemeral: true
            });
        }

        const runAt = new Date(unix * 1000);

        if(runAt < new Date())
        {
            return interaction.reply({
                content: 'The timestamp is in the past.',
                ephemeral: true
            });
        }

        await ScheduledMessage.create({
            runAt,
            channelId: channel.id,
            content: message
        });

        await interaction.reply({
            content: `Scheduled for <t:${unix}:F>`,
            ephemeral: true
        });
    }
};