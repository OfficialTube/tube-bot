const BOT_LOG_CHANNEL_ID = "1424584591590555648"; 
const BOT_LOGS_ROLE = "1430732603731738634"; 
let clientRef;

function setClient(client) {
  clientRef = client;
}

async function logOffline(message) {
  if (!clientRef) return;
  try {
    const channel = await clientRef.channels.fetch(BOT_LOG_CHANNEL_ID);
    if (channel && channel.isTextBased()) {
      await channel.send(`<@&${BOT_LOGS_ROLE}> ${message}`);
    }
  } catch (err) {
    console.error("Failed to send offline log:", err);
  }
}

module.exports = { logOffline, setClient };
