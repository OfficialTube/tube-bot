const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('openqueue')
        .setDescription('Open up a queue for Phasmophobia Viewer Games (admin only)')
        .addStringOption(option => 
            option.setName('timestamp')
                .setDescription('Epoch timestamp for when the queue should open.')
                .setRequired(true)
        ),
    async execute(interaction) {
        if (!interaction.member.roles.cache.has('1379719761075900468')) {
            return interaction.reply({ content: '❌ You do not have permissions to use this command.', ephemeral: true });
        }

        const queueChannelId = '1430021464056402010';
        const queueChannel = await interaction.guild.channels.fetch(queueChannelId);
        
        const rawTimestamp = interaction.options.getString('timestamp').trim();
        const epoch = parseInt(rawTimestamp, 10);

        if (isNaN(epoch)) {
            return interaction.reply({ content: '❌ Invalid epoch timestamp number format.', ephemeral: true });
        }

        const sendTime = epoch * 1000;
        const delay = sendTime - Date.now();

        if (delay <= 0) {
            return interaction.reply({ content: '❌ That timestamp target is already in the past.', ephemeral: true });
        }

        await interaction.reply({ content: `✅ Success! Queue scheduled to deploy at <t:${epoch}:f>.`, ephemeral: true });

        const difficultyMenu = new StringSelectMenuBuilder()
            .setCustomId('queue_difficulty')
            .setPlaceholder('Select Difficulty')
            .addOptions([
                { label: 'Professional', value: '1' },
                { label: 'Nightmare', value: '2' },
                { label: '0 Sanity, 0 Evidence', value: '3' },
            ]);

        const row = new ActionRowBuilder().addComponents(difficultyMenu);

        // When the queue opens up 30 minutes before the stream:
        setTimeout(async () => {
            try {
                // 1. Post the initial empty schedule block FIRST so it sits at the top
                const initialEmbed = new EmbedBuilder()
                    .setTitle('Phasmophobia Viewer Games Live Schedule')
                    .setColor(0x2f3136)
                    .setDescription('The queue is now officially open! Select a difficulty below to enter the queue.');

                const scheduleMessage = await queueChannel.send({ embeds: [initialEmbed] });

                // 2. Post the entry dropdown menu SECOND so it sits right below the schedule
                await queueChannel.send({ 
                    content: '# __Join the Phasmophobia Viewer Games Queue__\n\nSelect which difficulty you would like to play on below to reserve your space!', 
                    components: [row] 
                });
                
                // 3. Log this ID to your console! You will need to copy this ID.
                console.log(`=========================================`);
                console.log(`LIVE SCHEDULE MESSAGE DEPLOYED SUCCESSFULLY!`);
                console.log(`Message ID: ${scheduleMessage.id}`);
                console.log(`Target Epoch: ${epoch}`);
                console.log(`=========================================`);

            } catch (error) {
                console.error("Scheduled queue broadcast script error:", error);
            }
        }, delay);
    },
};
