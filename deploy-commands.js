require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { REST, Routes } = require("discord.js");

const commands = [];
const commandsPath = path.join(__dirname, "commands");

for (const folder of fs.readdirSync(commandsPath)) {
  const folderPath = path.join(commandsPath, folder);
  for (const file of fs.readdirSync(folderPath)) {
    const command = require(path.join(folderPath, file));
    if ("data" in command && "execute" in command) {
      commands.push(command.data.toJSON());
    }
  }
}

const rest = new REST().setToken(process.env.TOKEN);

(async () => {
  try {
    await rest.put(
        Routes.applicationCommands(process.env.CLIENT_ID),
        { body: [] }
        );
    console.log("🛰️ Clearing old guild commands...");
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, "1374336171341254738"),
      { body: [] }
    );
    console.log("🛰️ Deploying slash commands...");
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, "1374336171341254738"),
      { body: commands }
    );
    console.log("✅ Slash commands deployed.");
  } catch (error) {
    console.error("❌ Failed to deploy commands:", error);
  }
})();
