const fs = require("fs");
const path = require("path");

module.exports = (client) => {
  const commandsPath = path.join(__dirname, "../commands");

  for (const folder of fs.readdirSync(commandsPath)) {
    const folderPath = path.join(commandsPath, folder);
    
    // Skip admin folder since admin commands are prefix-only
    if (folder === 'admin') {
      console.log(`[INFO] Skipping admin commands - they are prefix-only`);
      continue;
    }
    
    for (const file of fs.readdirSync(folderPath)) {
      const command = require(path.join(folderPath, file));
      if ("data" in command && "execute" in command) {
        client.commands.set(command.data.name, command);
      } else {
        console.warn(`[WARN] The command at ${file} is missing "data" or "execute".`);
      }
    }
  }
};
