const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('openqueue')
    .setDescription('Open up a queue for Phasmophobia Viewer Games (admin only)')
    .addStringOption(option =>
      option
        .setName('timestamp')
        .setDescription('Epoch timestamp for when the queue should open.')
        .setRequired(true)
      ),
  async execute(interaction) 
  {
    if(!interaction.member.roles.cache.has('1379719761075900468'))
    {
      return interaction.reply({content: 'You do not have permissions to use this command.', ephemeral: true});
    }

    const queueChannelId = '1430021464056402010';
    const queueChannel = await interaction.guild.channels.fetch(queueChannelId);

    const epoch = parseInt(interaction.options.getString('timestamp').trim());
    if (isNaN(epoch)) {
      return interaction.reply({ content: 'Invalid epoch timestamp.', ephemeral: true });
    }

    const sendTime = epoch * 1000;
    const delay = sendTime - Date.now();

    if (delay <= 0) {
      return interaction.reply({ content: 'That time is in the past.', ephemeral: true });
    }

    await interaction.reply({
      content: `Queue will open at <t:${epoch}:f>.`,
      ephemeral: true,
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

    const nextButton = new ButtonBuilder()
      .setCustomId('queue_next_page')
      .setLabel('Next')
      .setStyle(ButtonStyle.Success);

    const buttonRow = new ActionRowBuilder().addComponents(nextButton);

    setTimeout(async () => {
      await queueChannel.send({
        content:
          '# __Join the Phasmophobia Viewer Games Queue__\n\nSelect which difficulty you would like to play on.',
        components: [row, buttonRow],
      });
    }, delay);
  },
};