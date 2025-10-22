require("dotenv").config();
const { REST, Routes } = require("discord.js");
const fs = require("fs");

const commands = [];
const commandFiles = fs.readdirSync("./commands");
for (const file of commandFiles) {
  const command = require(`./commands/${file}`);
  commands.push(command.data.toJSON());
}

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

rest.put(
  Routes.applicationGuildCommands("1334741254499598346", process.env.DEV_GUILD_ID),
  { body: commands }
).then(() => console.log("✅ Slash commands registered"));
