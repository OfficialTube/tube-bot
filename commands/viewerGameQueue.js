const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');

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
        // Admin Role Security Check
        if (!interaction.member.roles.cache.has('1379719761075900468')) {
            return interaction.reply({ content: '❌ You do not have permissions to use this command.', ephemeral: true });
        }

        const queueChannelId = '1430021464056402010';
        const queueChannel = await interaction.guild.channels.fetch(queueChannelId);
        
        // Clean up text spacing and convert into an integer number base 10
        const rawTimestamp = interaction.options.getString('timestamp').trim();
        const epoch = parseInt(rawTimestamp, 10);

        if (isNaN(epoch)) {
            return interaction.reply({ content: '❌ Invalid epoch timestamp number format. Please check your text value.', ephemeral: true });
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

        // Schedule delayed delivery to match stream announcement prep window
        setTimeout(async () => {
            try {
                await queueChannel.send({ 
                    content: '# __Join the Phasmophobia Viewer Games Queue__\n\nSelect which difficulty you would like to play on below to reserve your space!', 
                    components: [row] 
                });
            } catch (error) {
                console.error("Scheduled queue broadcast script error:", error);
            }
        }, delay);
    },
};
