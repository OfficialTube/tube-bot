const { ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

async function handleViewerGamesQueueInteractions(interaction)
{
    if (!interaction.isButton() && !interaction.isStringSelectMenu()) return;

    if (interaction.customId === 'queue_next_page')
    {
        const twitchSubRoleId = '1422737505257783447';
        const hasSub = interaction.member.roles.cache.has(twitchSubRoleId);

        if (hasSub)
        {
            const subDifficultyMenu = new StringSelectMenuBuilder()
                .setCustomId('sub_queue_difficulty')
                .setPlaceholder('Select Difficulty')
                .addOptions([
                    { label: 'Professional', value: '1'},
                    { label: 'Nightmare', value: '2'},
                    { label: '0 Sanity, 0 Evidence', value: '3'},
                ]);
            const row = new ActionRowBuilder().addComponents(subDifficultyMenu);

            await interaction.reply({
                content: 'Since you are a Twitch Subscriber, you get to play 2 additional games! Which difficulty would you like to do for your additional games?',
                components: [row],
                ephemeral: true,
            });
        }
        else
        {
            const queueConfirmButton = new ButtonBuilder()
                .setCustomId('queue_confirm')
                .setLabel('Submit')
                .setStyle(ButtonStyle.Primary);
            const row = new ActionRowBuilder().addComponents(confirmButton);

            await interaction.reply({
                content: 'Please confirm to join the queue.',
                components: [row],
                ephemeral: true,
            });
        }
    }
    if (interactino.customId === 'sub_queue_difficulty')
    {
        const confirmButton = new ButtonBuilder()
            .setCustomId('queue_confirm')
            .setLabel('Submit')
            .setStyle(ButtonStyle.Primary);
        const row = new ActionRowBuilder().addComponents(confirmButton);

        await interaction.update({
            content: `Selected: ${interaction.values[0]}\nPlease confirm to join the queue.`,
            components: [row],
        });
    }

    if (interaction.customId === 'queue_confirm')
    {
        await interaction.update({
            content: 'You have been added to the queue.',
            components: [],
        });

        //save info to MongoDB here
    }
}

module.exports = { handleViewerGamesQueueInteractions };