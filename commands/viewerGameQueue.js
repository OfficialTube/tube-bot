const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder } = require('discord.js');

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

        const queueChannelId = '1430021464056402010';
        const queueChannel = await interaction.guild.channels.fetch(queueChannelId);
        const epoch = parseInt(interaction.options.getString('timestamp').trim(), 10);

        if (isNaN(epoch)) {
            return interaction.reply({ content: '❌ Invalid epoch timestamp.', ephemeral: true });
        }

        const sendTime = epoch * 1000;
        const delay = sendTime - Date.now();

        if (delay <= 0) {
            return interaction.reply({ content: '❌ That time is in the past.', ephemeral: true });
        }

        // 1. DEPLOY THE MASTER SCHEDULE EMBED IMMEDIATELY FOR EARLY STREAM CONFIGURATION!
        const initialEmbed = new EmbedBuilder()
            .setTitle('Phasmophobia Viewer Games Live Schedule')
            .setColor('#2f3136')
            .setDescription('The queue schedule board has been deployed. The entry registration selector dropdown will open up automatically 30 minutes before the stream starts!');

        const scheduleMessage = await queueChannel.send({ embeds: [initialEmbed] });

        // 2. Return copy-paste linkage tools to you immediately on screen
        await interaction.reply({ 
            content: `✅ **Schedule board deployed live!**\n\nCopy and run this exact linkage command in your staff channel right now to lock it in:\n\`\`\`/lobby set_metadata message_id: ${scheduleMessageMessageId || scheduleMessage.id} epoch: ${epoch}\`\`\``, 
            ephemeral: true 
        });

        const difficultyMenu = new StringSelectMenuBuilder()
            .setCustomId('queue_difficulty')
            .setPlaceholder('Select Difficulty')
            .addOptions([
                { label: 'Professional', value: '1' },
                { label: 'Nightmare', value: '2' },
                { label: '0 Sanity, 0 Evidence', value: '3' },
            ]);

        const row = new ActionRowBuilder().addComponents(difficultyMenu);

        // 3. Dropdown option handles reveal automatically on your scheduled delay clock
        setTimeout(async () => {
            try {
                const activeEmbed = new EmbedBuilder()
                    .setTitle('Phasmophobia Viewer Games Live Schedule')
                    .setColor('#2f3136')
                    .setDescription('The queue is now officially open! Select a difficulty below to join the queue.');
                
                await scheduleMessage.edit({ embeds: [activeEmbed] });

                await queueChannel.send({ 
                    content: '# __Join the Phasmophobia Viewer Games Queue__\n\nSelect which difficulty you would like to play on.', 
                    components: [row], 
                });

                console.log(`=========================================`);
                console.log(`🚨 REGISTRATION MENU UNLOCKED ON TIME!`);
                console.log(`=========================================`);

            } catch (error) {
                console.error("Delayed dropdown deployment failed:", error);
            }
        }, delay);
    },
};
