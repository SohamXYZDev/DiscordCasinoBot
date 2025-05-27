require("dotenv").config();
const { Client, GatewayIntentBits, Collection, Events } = require("discord.js");
const connectDB = require("./config/db");
const GuildConfig = require("./models/GuildConfig");

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.commands = new Collection();
require("./handlers/commandHandler")(client);

client.once("ready", async () => {
  await connectDB();
  console.log(`🤖 Logged in as ${client.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
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

client.login(process.env.TOKEN);
