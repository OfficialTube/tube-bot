require("dotenv").config();
const { Client, GatewayIntentBits, Collection } = require("discord.js");
const connectDB = require("./database");
const fs = require("fs");
const { handleMessageXP } = require("./levels");

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

client.commands = new Collection();
const commandFiles = fs.readdirSync("./commands");
for (const file of commandFiles) {
  const command = require(`./commands/${file}`);
  client.commands.set(command.data.name, command);
}

const BOT_LOG_CHANNEL_ID = "1424584591590555648"; 
const YOUR_USER_ID = "464597977798017024"; 


const { logOffline, setClient } = require("./utils/logger");
setClient(client);

client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  logOffline("Bot is now online!");
});

client.on("interactionCreate", async interaction => {
  if (!interaction.isCommand()) return;

  const command = client.commands.get(interaction.commandName);

  try {
    if (command) {
      await command.execute(interaction);
    } else {
      console.warn(`Unknown command: ${interaction.commandName}`);
    }
  } catch (error) {
    console.error(`Error executing command: ${interaction.commandName}`, error);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: "There was an error executing this command.", ephemeral: true });
    } else {
      await interaction.reply({ content: "There was an error executing this command.", ephemeral: true });
    }
  }
});


client.on("messageCreate", async message => {
  const { user, leveledUp } = await handleMessageXP(message);
  if (leveledUp) {
    message.guild.channels.cache.get("1422054956264980481").send(`<@${message.author.id}> is now level **${user.level}**!`);
  }
});

connectDB().then(() => {
  client.login(process.env.DISCORD_TOKEN);
});
