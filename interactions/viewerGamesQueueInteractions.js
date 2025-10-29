const { ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const ViewerQueue = require('../models/ViewerQueue');

// Tracks user selections in memory
const userSelections = new Map();

const difficultyLabels = {
  "1": "Professional",
  "2": "Nightmare",
  "3": "0 Sanity, 0 Evidence",
};

async function handleViewerGamesQueueInteractions(interaction) {
  if (!interaction.isButton() && !interaction.isStringSelectMenu()) return;

  const userId = interaction.user.id;
  const username = interaction.user.username;
  const twitchSubRoleId = "1422737505257783447";

  // STEP 1 — user selects main difficulty
  if (interaction.customId === "queue_difficulty") {
    const diff = interaction.values[0];
    userSelections.set(userId, { difficulty: diff });

    // Start private ephemeral flow
    await interaction.deferReply({ ephemeral: true });

    const nextButton = new ButtonBuilder()
      .setCustomId("queue_next")
      .setLabel("Next")
      .setStyle(ButtonStyle.Success);

    const buttonRow = new ActionRowBuilder().addComponents(nextButton);

    await interaction.editReply({
      content: `You selected: **${difficultyLabels[diff]}**.\nClick **Next** to continue.`,
      components: [buttonRow],
    });
  }

  // STEP 2 — user clicks Next after selecting main difficulty
  else if (interaction.customId === "queue_next") {
    const userData = userSelections.get(userId);
    if (!userData || !userData.difficulty) {
      return interaction.reply({
        content: "⚠️ Please select a difficulty before clicking Next.",
        ephemeral: true,
      });
    }

    const hasSub = interaction.member.roles.cache.has(twitchSubRoleId);

    // If subscriber → bonus game flow
    if (hasSub) {
      const subMenu = new StringSelectMenuBuilder()
        .setCustomId("sub_queue_difficulty")
        .setPlaceholder("Select your bonus game difficulty")
        .addOptions([
          { label: "Professional", value: "1" },
          { label: "Nightmare", value: "2" },
          { label: "0 Sanity, 0 Evidence", value: "3" },
        ]);

      const nextSubButton = new ButtonBuilder()
        .setCustomId("queue_next_sub")
        .setLabel("Next")
        .setStyle(ButtonStyle.Success);

      const row = new ActionRowBuilder().addComponents(subMenu);
      const buttonRow = new ActionRowBuilder().addComponents(nextSubButton);

      await interaction.deferReply({ ephemeral: true });
      return interaction.editReply({
        content:
          "🎉 Since you're a **Twitch Subscriber**, you get to play **2 extra games!**\nSelect your **bonus difficulty** below, then click **Next**.",
        components: [row],
      });
    }

    // Non-subscriber flow → confirm single difficulty
    const confirmButton = new ButtonBuilder()
      .setCustomId("queue_confirm")
      .setLabel("Confirm")
      .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder().addComponents(confirmButton);

    await interaction.deferReply({ ephemeral: true });
    return interaction.editReply({
      content: `**Selected Difficulty:** ${difficultyLabels[userData.difficulty]}\nClick **Confirm** to join the queue.`,
      components: [row],
    });
  }

  // STEP 3 — subscriber selects bonus difficulty
  else if (interaction.customId === "sub_queue_difficulty") {
    const diff = interaction.values[0];
    const current = userSelections.get(userId) || {};
    current.subDifficulty = diff;
    userSelections.set(userId, current);

    await interaction.editReply({
      content: `Selected bonus difficulty: **${difficultyLabels[diff]}**.\nClick **Next** to continue.`,
      components: [buttonRow],
    });
  }

  // STEP 4 — subscriber clicks Next to confirm both difficulties
  else if (interaction.customId === "queue_next_sub") {
    const data = userSelections.get(userId);
    if (!data || !data.difficulty || !data.subDifficulty) {
      return interaction.reply({
        content: "⚠️ Please make sure you've selected both difficulties first.",
        ephemeral: true,
      });
    }

    const confirmButton = new ButtonBuilder()
      .setCustomId("queue_confirm")
      .setLabel("Confirm")
      .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder().addComponents(confirmButton);

    return interaction.editReply({
      content: `**Selected Difficulties:**\n• ${difficultyLabels[data.difficulty]}\n• ${difficultyLabels[data.subDifficulty]}\nClick **Confirm** to join the queue.`,
      components: [row],
    });
  }

  // STEP 5 — user clicks Confirm to join queue(s)
  else if (interaction.customId === "queue_confirm") {
    const data = userSelections.get(userId);
    if (!data || !data.difficulty) {
      return interaction.reply({
        content: "No difficulty selection found.",
        ephemeral: true,
      });
    }

    const allDiffs = [data.difficulty];
    if (data.subDifficulty) allDiffs.push(data.subDifficulty);

    for (const diff of allDiffs) {
      let queueGroup = await ViewerQueue.findOne({ difficulty: diff, isFull: false });

      // Avoid joining same group twice
      if (queueGroup && queueGroup.players.some((p) => p.id === userId)) {
        const otherGroup = await ViewerQueue.findOne({
          difficulty: diff,
          isFull: false,
          _id: { $ne: queueGroup._id },
        });
        queueGroup = otherGroup || new ViewerQueue({ difficulty: diff, players: [] });
      }

      if (!queueGroup) queueGroup = new ViewerQueue({ difficulty: diff, players: [] });
      queueGroup.players.push({ id: userId, username });

      if (queueGroup.players.length >= 3) queueGroup.isFull = true;
      await queueGroup.save();
    }

    await interaction.editReply({
      content: `✅ You’ve been added to the queue${data.subDifficulty ? " for both games!" : "!"}`,
    });

    userSelections.delete(userId);
  }
}

module.exports = { handleViewerGamesQueueInteractions };
