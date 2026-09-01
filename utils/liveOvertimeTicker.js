const { refreshSchedule } = require('./queueScheduler');

let tickerInterval = null;

function startOvertimeTicker(client, channelId, messageId, queueStartTimeEpoch) {
    if (tickerInterval) clearInterval(tickerInterval);

    tickerInterval = setInterval(async () => {
        try {
            await refreshSchedule(client, channelId, messageId, queueStartTimeEpoch);
        } catch (error) {
            console.error("Overtime ticker loop exception:", error);
        }
    }, 60000); // Ticks background evaluation updates forward every 60 seconds
}

module.exports = { startOvertimeTicker };
