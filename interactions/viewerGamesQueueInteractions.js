const { ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const ViewerQueue = require('../models/ViewerQueue');

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

  // --- Handle difficulty selection ---
  if (interaction.customId === "queue_difficulty") {
    const diff = interaction.values[0];
    userSelections.set(userId, { difficulty: diff });

    const nextButton = new ButtonBuilder()
      .setCustomId("queue_next")
      .setLabel("Next")
      .setStyle(ButtonStyle.Success);

    const row = new ActionRowBuilder().addComponents(nextButton);

    return interaction.update({
      content: `Selected Difficulty: **${difficultyLabels[diff]}**.\nClick **Next** to continue.`,
      components: [row],
      ephemeral: true,
    });
  }

  // --- Handle first "Next" button ---
  if (interaction.customId === "queue_next") {
    const userData = userSelections.get(userId);
    if (!userData || !userData.difficulty) {
      return interaction.reply({
        content: "⚠️ Please select a difficulty first.",
        ephemeral: true,
      });
    }

    const hasSub = interaction.member.roles.cache.has(twitchSubRoleId);

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

      return interaction.update({
        content: "Since you're a **Twitch Subscriber**, you get **2 bonus games**!\nSelect your bonus difficulty, then click **Next**.",
        components: [row, buttonRow],
        ephemeral: true,
      });
    } else {
      const confirmButton = new ButtonBuilder()
        .setCustomId("queue_confirm")
        .setLabel("Confirm")
        .setStyle(ButtonStyle.Primary);

      const row = new ActionRowBuilder().addComponents(confirmButton);

      return interaction.update({
        content: `**Selected Difficulty:** ${difficultyLabels[userData.difficulty]}\nClick **Confirm** to join the queue.`,
        components: [row],
        ephemeral: true,
      });
    }
  }

  // --- Handle sub difficulty selection ---
  if (interaction.customId === "sub_queue_difficulty") {
    const diff = interaction.values[0];
    const current = userSelections.get(userId) || {};
    current.subDifficulty = diff;
    userSelections.set(userId, current);

    return interaction.update({
      content: `Selected bonus difficulty: **${difficultyLabels[diff]}**.\nClick **Next** to continue.`,
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("queue_next_sub")
            .setLabel("Next")
            .setStyle(ButtonStyle.Success)
        ),
      ],
      ephemeral: true,
    });
  }

  // --- Handle Next after Sub Difficulty ---
  if (interaction.customId === "queue_next_sub") {
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

    return interaction.update({
      content: `**Selected Difficulties:**\n• ${difficultyLabels[data.difficulty]}\n• ${difficultyLabels[data.subDifficulty]}\nClick **Confirm** to join the queue.`,
      components: [row],
      ephemeral: true,
    });
  }

  // --- Handle Confirm button ---
  if (interaction.customId === "queue_confirm") {
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
      // Avoid joining same difficulty twice
      const existing = await ViewerQueue.findOne({
        difficulty: diff,
        "players.id": userId,
      });
      if (existing) continue;

      // Find or create group
      let queueGroup = await ViewerQueue.findOne({ difficulty: diff, isFull: false });
      if (!queueGroup) {
        queueGroup = new ViewerQueue({ difficulty: diff, players: [], isFull: false });
      }

      queueGroup.players.push({ id: userId, username });
      if (queueGroup.players.length >= 3) queueGroup.isFull = true;
      await queueGroup.save();
    }

    await interaction.update({
      content: `✅ You’ve been added to the queue${data.subDifficulty ? " for both games!" : "!"}`,
      components: [],
      ephemeral: true,
    });

    userSelections.delete(userId);
  }
}

module.exports = { handleViewerGamesQueueInteractions };
