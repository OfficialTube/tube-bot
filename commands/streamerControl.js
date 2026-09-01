const { SlashCommandBuilder } = require('discord.js');
const ViewerQueue = require('../models/ViewerQueue');
const { refreshSchedule } = require('../utils/queueScheduler');
const { setScheduleConfig } = require('../interactions/viewerGamesQueueInteractions');

const PUBLIC_QUEUE_CHANNEL_ID = "1430021464056402010"; 
let ADMIN_TRACKED_EPOCH = 0;
let ADMIN_TRACKED_MSG_ID = "";

module.exports = {
    data: new SlashCommandBuilder()
        .setName('lobby')
        .setDescription('Streamer live execution control deck for viewer games.')
        .addSubcommand(sub => sub
            .setName('set_metadata')
            .setDescription('Link active layout tracking references.')
            .addStringOption(o => o.setName('message_id').setDescription('Schedule post message ID').setRequired(true))
            .addIntegerOption(o => o.setName('epoch').setDescription('The open queue timestamp number').setRequired(true))
        )
        .addSubcommand(sub => sub
            .setName('send_code')
            .setDescription('Stage 1 (Setup): Pings players and sends your Phasmophobia room lobby code via DMs.')
            .addStringOption(o => o.setName('code').setDescription('The lobby entry invite code').setRequired(true))
        )
        .addSubcommand(sub => sub
            .setName('advance')
            .setDescription('Advance active lobby to next stage (Start G1 -> Mid -> G2 -> Outro -> Finish).')
        ),

    async execute(interaction) {
        if (!interaction.member.roles.cache.has('1379719761075900468')) {
            return interaction.reply({ content: 'Unauthorized.', ephemeral: true });
        }

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'set_metadata') {
            ADMIN_TRACKED_MSG_ID = interaction.options.getString('message_id');
            ADMIN_TRACKED_EPOCH = interaction.options.getInteger('epoch');
            setScheduleConfig(ADMIN_TRACKED_MSG_ID, ADMIN_TRACKED_EPOCH);
            
            await refreshSchedule(interaction.client, PUBLIC_QUEUE_CHANNEL_ID, ADMIN_TRACKED_MSG_ID, ADMIN_TRACKED_EPOCH);
            return interaction.reply({ content: `✅ Configuration metadata registered!`, ephemeral: true });
        }

        // STEP 1: LOAD IN THE NEXT TEAM & TRANSMIT PRIVATE ROOM CODES
        if (subcommand === 'send_code') {
            const code = interaction.options.getString('code').trim();

            const existingActive = await ViewerQueue.findOne({ status: { $in: ['setup', 'game1', 'midgame', 'game2', 'outro'] } });
            if (existingActive) {
                return interaction.reply({ content: `⚠️ Clear out or finish the active running group before starting a new one! (Current stage: \`${existingActive.status}\`)`, ephemeral: true });
            }

            const targetLobby = await ViewerQueue.findOne({ isFull: true, status: 'waiting' }).sort({ filledAt: 1 });
            if (!targetLobby) {
                return interaction.reply({ content: '❌ No full lobbies are flagged as waiting inside the DB records.', ephemeral: true });
            }

            // Move to initial SETUP buffer stage
            targetLobby.status = 'setup';
            targetLobby.timeSetupStart = new Date();
            await targetLobby.save();

            // Direct message room codes to group members
            for (const p of targetLobby.players) {
                try {
                    const user = await interaction.client.users.fetch(p.id);
                    await user.send(`🎮 **Your Phasmophobia Viewer Group is UP!**\nJoin NA Servers using code: \`${code}\`\n*Do not distribute this room key code!*`);
                } catch (e) { console.error(`Unreachable DM user path: ${p.username}`); }
            }

            await refreshSchedule(interaction.client, PUBLIC_QUEUE_CHANNEL_ID, ADMIN_TRACKED_MSG_ID, ADMIN_TRACKED_EPOCH);
            return interaction.reply({ content: `✅ Group moved to **Setup Stage**. Sent code \`${code}\` to players!`, ephemeral: true });
        }

        // UNIFIED ADVANCING STATE CONTROLLER
        if (subcommand === 'advance') {
            const active = await ViewerQueue.findOne({ status: { $in: ['setup', 'game1', 'midgame', 'game2', 'outro'] } });
            if (!active) return interaction.reply({ content: '❌ There is no active group currently running to advance.', ephemeral: true });

            let replyMsg = "";

            if (active.status === 'setup') {
                active.status = 'game1';
                active.timeGame1Start = new Date();
                replyMsg = "🎮 Stage updated: **Game 1/2 is now IN PROGRESS**.";
            } 
            else if (active.status === 'game1') {
                active.status = 'midgame';
                active.timeGame1End = new Date();
                replyMsg = "☕ Stage updated: **Game 1 complete.** Now in post-game review/banter buffer.";
            } 
            else if (active.status === 'midgame') {
                active.status = 'game2';
                active.timeGame2Start = new Date();
                replyMsg = "💀 Stage updated: **Game 2/2 is now IN PROGRESS**.";

                // 🔔 CRITICAL REQ: DM THE STANDBY GROUP TO PREPARE SINCE GAME 2 JUST BEGAN
                const nextUp = await ViewerQueue.findOne({ isFull: true, status: 'waiting' }).sort({ filledAt: 1 });
                if (nextUp) {
                    for (const p of nextUp.players) {
                        try {
                            const user = await interaction.client.users.fetch(p.id);
                            await user.send(`⚠️ **Standby Notice:** The active streaming lobby has just launched their **last game**. Please boot up Phasmophobia and stay ready to receive your room entry invite code!`);
                        } catch (e) {}
                    }
                }
            } 
            else if (active.status === 'game2') {
                active.status = 'outro';
                active.timeGame2End = new Date();
                replyMsg = "👋 Stage updated: **Game 2 complete.** Now in outro/goodbye buffer wrap up.";
            } 
            else if (active.status === 'outro') {
                active.status = 'completed';
                active.timeOutroEnd = new Date();
                replyMsg = "🏁 Stage updated: **Lobby Completely Finished.** Active channel cleared! Use `/lobby send_code` to pull in the next team link.";
            }

            await active.save();
            await refreshSchedule(interaction.client, PUBLIC_QUEUE_CHANNEL_ID, ADMIN_TRACKED_MSG_ID, ADMIN_TRACKED_EPOCH);
            return interaction.reply({ content: replyMsg, ephemeral: true });
        }
    }
};
