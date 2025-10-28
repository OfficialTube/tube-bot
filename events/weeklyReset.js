const cron = require('node-cron');
const User = require('../models/User');
const { logOffline } = require('../utils/logger');

const GUILD_ID = '1334736733337686058';
const MOD_ROLE_ID = '1379719761075900468';
const YAPPER_ROLE_ID = '1432793828334632981';
const LOG_CHANNEL_ID = '1379723391417978930';

module.exports = (client) => {
    cron.schedule('5 0 * * 0', async () => {
        try
        {
            const guild = await client.guilds.fetch(GUILD_ID);
            const members = await guild.members.fetch();

            const allUsers = await User.find({weeklyXP: {$gt: 0}})
                .sort({weeklyXP: -1})
                .lean();

            const topUsers = [];
            for (const userData of allUsers)
            {
                const member = members.get(userData.userId);
                if (!member) continue;
                if (!member.roles.cache.has(MOD_ROLE_ID)) topUsers.push(member);
                if (topUsers.length === 3) break;
            }
            for (const member of members.values())
            {
                if (member.roles.cache.has(YAPPER_ROLE_ID))
                {
                    await member.roles.remove(YAPPER_ROLE_ID).catch(() => {});
                }
            }
            for (const member of topUsers)
            {
                await member.roles.add(YAPPER_ROLE_ID).catch(() => {});
            }

            const channel = guild.channels.cache.get(LOG_CHANNEL_ID);
            if (channel)
            {
                if (topUsers.length)
                {
                    const messageLines = topUsers.map(
                        ({ member, xp }, i) => `**${i+1}.** ${member.user.tag} - ${xp.toLocaleString()} XP`
                    );
                    await channel.send(
                        `#Yappers of the Week:\n\n${messageLines.join('\n')}`
                    );
                } else
                {
                    await channel.send('No eligible yappers this week.');
                }
            }
            logOffline('Weekly XP rest complete!');
        } catch (err) 
        {
            logOffline('Weekly reset failed!');
            console.error('Weekly reset failed:', err);
        }
    });
};