require("dotenv").config();
const { Client, GatewayIntentBits, Collection, Events } = require("discord.js");
const connectDB = require("./config/db");
const GuildConfig = require("./models/GuildConfig");

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMessages],
});

client.commands = new Collection();
require("./handlers/commandHandler")(client);

client.once("ready", async () => {
  await connectDB();
  console.log(`🤖 Logged in as ${client.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  // Handle select menu for /deposit
  if (interaction.isStringSelectMenu() && interaction.customId === 'deposit-crypto-select') {
    const depositCmd = require('./commands/economy/deposit.js');
    return depositCmd.handleComponent(interaction);
  }
  // Handle select menu for /withdraw
  if (interaction.isStringSelectMenu() && interaction.customId === 'withdraw-crypto-select') {
    const withdrawCmd = require('./commands/economy/withdraw.js');
    return withdrawCmd.handleComponent(interaction);
  }
  if (interaction.isStringSelectMenu() && interaction.customId === 'help-category-select') {
    const helpCmd = require('./commands/help/help.js'); // Adjust path if needed
    return helpCmd.handleComponent(interaction);
  }
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  // Command logging
  if (interaction.guildId) {
    const config = await GuildConfig.findOne({ guildId: interaction.guildId });
    if (config && config.logChannel) {
      const logChannel = await client.channels.fetch(config.logChannel).catch(() => null);
      if (logChannel && logChannel.isTextBased()) {
        const user = interaction.user;
        const logMsg = `📝 **/${interaction.commandName}** used by <@${user.id}> (${user.tag})${interaction.options && interaction.options.data.length ? ` | Options: ${interaction.options.data.map(o => `${o.name}: ${o.value}`).join(", ")}` : ""}`;
        logChannel.send({ content: logMsg }).catch(() => {});
      }
    }
  }

  try {
    await command.execute(interaction);
  } catch (err) {
    console.error(err);
    await interaction.reply({ content: "❌ There was an error executing that command.", ephemeral: true });
  }
});

// Handle prefix commands (admin commands only)
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith('.')) return;
  
  const args = message.content.slice(1).trim().split(/ +/);
  const commandName = args.shift().toLowerCase();
  
  // Check if it's an admin command
  const adminCommands = [
    'banuser', 'disablegame', 'enablegame', 'resetprobabilities', 
    'resetuser', 'setbalance', 'setcurrency', 'setedge', 'setlogs', 'setprobability'
  ];
  
  if (!adminCommands.includes(commandName)) return;
  
  // Check admin permissions
  if (!message.member || !message.member.permissions.has('Administrator')) {
    return message.reply('❌ You need Administrator permission to use admin commands.');
  }
  
  try {
    const command = require(`./commands/admin/${commandName}.js`);
    if (command && command.executePrefix) {
      await command.executePrefix(message, args);
    }
  } catch (error) {
    console.error(`Error executing prefix command ${commandName}:`, error);
    message.reply('❌ There was an error executing that command.');
  }
});

client.login(process.env.TOKEN);
