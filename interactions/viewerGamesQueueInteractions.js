const { ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const ViewerQueue = require('../models/ViewerQueue');

const userSelections = new Map();
const difficultyLabels = {
    '1': 'Professional',
    '2': 'Nightmare',
    '3': '0 Sanity, 0 Evidence',
};

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
          { label: 'Professional', value: '1' },
          { label: 'Nightmare', value: '2' },
          { label: '0 Sanity, 0 Evidence', value: '3' },
        ]);
      const row = new ActionRowBuilder().addComponents(subDifficultyMenu);

      await interaction.reply({
        content: 'Since you are a Twitch Subscriber, you get to play 2 additional games! Which difficulty would you like to do for your additional games?',
        components: [row],
        ephemeral: true,
      });
    } else {
      const queueConfirmButton = new ButtonBuilder()
        .setCustomId('queue_confirm')
        .setLabel('Submit')
        .setStyle(ButtonStyle.Primary);
      const row = new ActionRowBuilder().addComponents(queueConfirmButton);

      await interaction.reply({
        content: 'Please confirm to join the queue.',
        components: [row],
        ephemeral: true,
      });
    }
  }

  if (interaction.customId === 'queue_difficulty') {
    const diff = interaction.values[0];
    const diffLabel = difficultyLabels[diff] || 'Unknown';
    userSelections.set(interaction.user.id, diff);

    const confirmButton = new ButtonBuilder()
      .setCustomId('queue_confirm')
      .setLabel('Submit')
      .setStyle(ButtonStyle.Primary);
    const row = new ActionRowBuilder().addComponents(confirmButton);

    await interaction.update({
      content: `Selected: ${diffLabel}\nPlease confirm to join the queue.`,
      components: [row],
    });
  }

  if (interaction.customId === 'sub_queue_difficulty') {
    const diff = interaction.values[0];
    const diffLabel = difficultyLabels[diff] || "Unknown";
    userSelections.set(interaction.user.id, diff);

    const confirmButton = new ButtonBuilder()
      .setCustomId('queue_confirm')
      .setLabel('Submit')
      .setStyle(ButtonStyle.Primary);
    const row = new ActionRowBuilder().addComponents(confirmButton);

    await interaction.update({
      content: `Selected: ${diffLabel}\nPlease confirm to join the queue.`,
      components: [row],
    });
  }

  if (interaction.customId === 'queue_confirm') {
    const userId = interaction.user.id;
    const username = interaction.user.username;
    const difficulty = userSelections.get(userId); 

    if (!difficulty) {
      return interaction.update({
        content: 'Something went wrong — please select a difficulty first.',
        components: [],
      });
    }

    let queueGroup = await ViewerQueue.findOne({ difficulty, isFull: false });

    if (!queueGroup) {
      queueGroup = new ViewerQueue({ difficulty, players: [] });
    }

    const alreadyInGroup = queueGroup.players.some(p => p.id === userId);
    if (alreadyInGroup) {
    const otherGroup = await ViewerQueue.findOne({
        difficulty,
        isFull: false,
        _id: { $ne: queueGroup._id }
    });

    if (otherGroup) {
        queueGroup = otherGroup;
    } else {
        queueGroup = new ViewerQueue({ difficulty, players: [] });
    }
    }

    queueGroup.players.push({ id: userId, username });

    if (queueGroup.players.length >= 3) {
      queueGroup.isFull = true;
    }

    await queueGroup.save();

    if (queueGroup.isFull) {
      const allQueues = await ViewerQueue.find().sort({ createdAt: 1 });
      const others = allQueues.filter((q) => q.id !== queueGroup.id);
      const reordered = [queueGroup, ...others];
    }

    userSelections.delete(userId);

    await interaction.update({
      content: 'You have been added to the queue.',
      components: [],
    });
  }
}

module.exports = { handleViewerGamesQueueInteractions };
