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
            // Switched to String Option to natively prevent 32-bit number constraint exceptions
            .addStringOption(o => o.setName('epoch').setDescription('The exact open queue timestamp string numbers').setRequired(true))
        )
        .addSubcommand(sub => sub
            .setName('send_code')
            .setDescription('Stage 1 (Setup): Pings players and sends your Phasmophobia room lobby code via DMs.')
            .addStringOption(o => o.setName('code').setDescription('The lobby entry invite code').setRequired(true))
        )
        .addSubcommand(sub => sub
            .setName('advance')
            .setDescription('Advance active lobby to next stage.')
        ),

    async execute(interaction) {
        // Safe Role Validation
        if (!interaction.member.roles.cache.has('1379719761075900468')) {
            return interaction.reply({ content: '❌ Unauthorized.', ephemeral: true });
        }

        const subcommand = interaction.options.getSubcommand();

        try {
            if (subcommand === 'set_metadata') {
                const msgIdInput = interaction.options.getString('message_id').trim();
                const rawEpoch = interaction.options.getString('epoch').trim();
                
                const parsedEpoch = parseInt(rawEpoch, 10);
                if (isNaN(parsedEpoch)) {
                    return interaction.reply({ content: '❌ Invalid epoch timestamp number format. Please check your text inputs.', ephemeral: true });
                }

                ADMIN_TRACKED_MSG_ID = msgIdInput;
                ADMIN_TRACKED_EPOCH = parsedEpoch;
                
                // Transmit keys to your interaction processor cache lines
                setScheduleConfig(ADMIN_TRACKED_MSG_ID, ADMIN_TRACKED_EPOCH);
                
                // Fire off immediate timetable refresh array maps
                await refreshSchedule(interaction.client, PUBLIC_QUEUE_CHANNEL_ID, ADMIN_TRACKED_MSG_ID, ADMIN_TRACKED_EPOCH);
                return interaction.reply({ content: `✅ Configuration metadata registered! Live Schedule tracking is active.`, ephemeral: true });
            }

            // STAGE 1: INGEST NEW TEAM & TRANSMIT LOBBY KEYS
            if (subcommand === 'send_code') {
                const code = interaction.options.getString('code').trim();

                const existingActive = await ViewerQueue.findOne({ status: { $in: ['setup', 'game1', 'midgame', 'game2', 'outro'] } });
                if (existingActive) {
                    return interaction.reply({ content: `⚠️ Clear out or finish the active running group before starting a new one! (Current stage: \`${existingActive.status}\`)`, ephemeral: true });
                }

                const targetLobby = await ViewerQueue.findOne({ isFull: true, status: 'waiting' }).sort({ filledAt: 1 });
                if (!targetLobby) {
                    return interaction.reply({ content: '❌ No full lobbies are flagged as waiting inside the database.', ephemeral: true });
                }

                targetLobby.status = 'setup';
                targetLobby.timeSetupStart = new Date();
                await targetLobby.save();

                for (const p of targetLobby.players) {
                    try {
                        const user = await interaction.client.users.fetch(p.id);
                        await user.send(`**Your Phasmophobia Viewer Group is UP!**\nJoin NA Servers using code: \`${code}\`\n\n*Reminder: Do not share this code or you will be banned from future games.*`);
                    } catch (e) { console.error(`Unreachable DM user path for: ${p.username}`); }
                }

                await refreshSchedule(interaction.client, PUBLIC_QUEUE_CHANNEL_ID, ADMIN_TRACKED_MSG_ID, ADMIN_TRACKED_EPOCH);
                return interaction.reply({ content: `✅ Group moved to **Setup Stage**. Sent code \`${code}\` to players!`, ephemeral: true });
            }

            // DYNAMIC TIMELINE STATE ADVANCER
            if (subcommand === 'advance') {
                const active = await ViewerQueue.findOne({ status: { $in: ['setup', 'game1', 'midgame', 'game2', 'outro'] } });
                if (!active) return interaction.reply({ content: '❌ There is no active group currently running to advance.', ephemeral: true });

                let replyMsg = "";

                if (active.status === 'setup') {
                    active.status = 'game1';
                    active.timeGame1Start = new Date();
                    replyMsg = "Stage updated: **Game 1/2 is now IN PROGRESS**.";
                } 
                else if (active.status === 'game1') {
                    active.status = 'midgame';
                    active.timeGame1End = new Date();
                    replyMsg = "Stage updated: **Game 1 complete.** Now in post-game review break.";
                } 
                else if (active.status === 'midgame') {
                    active.status = 'game2';
                    active.timeGame2Start = new Date();
                    replyMsg = "Stage updated: **Game 2/2 is now IN PROGRESS**.";

                    const nextUp = await ViewerQueue.findOne({ isFull: true, status: 'waiting' }).sort({ filledAt: 1 });
                    if (nextUp) {
                        for (const p of nextUp.players) {
                            try {
                                const user = await interaction.client.users.fetch(p.id);
                                await user.send(`⚠️ **Standby Notice:** The group before you has just started their **last game**. Please launch Phasmophobia and stay ready to receive your room entry invite code! Make sure your region is set to NA in-game. `);
                            } catch (e) {}
                        }
                    }
                } 
                else if (active.status === 'game2') {
                    active.status = 'outro';
                    active.timeGame2End = new Date();
                    replyMsg = "Stage updated: **Game 2 complete.**";
                } 
                else if (active.status === 'outro') {
                    active.status = 'completed';
                    active.timeOutroEnd = new Date();
                    replyMsg = "Stage updated: **Lobby Completely Finished.** Active channel cleared! Use `/lobby send_code` to pull in the next team link.";
                }

                await active.save();
                await refreshSchedule(interaction.client, PUBLIC_QUEUE_CHANNEL_ID, ADMIN_TRACKED_MSG_ID, ADMIN_TRACKED_EPOCH);
                return interaction.reply({ content: replyMsg, ephemeral: true });
            }
            
        } catch (error) {
            console.error("Staff Controller internal process error exception:", error);
            return interaction.reply({ content: `❌ **Internal Code Exception:** An error occurred. Check your hosting terminal logs for details.`, ephemeral: true }).catch(() => {});
        }
    }
};
