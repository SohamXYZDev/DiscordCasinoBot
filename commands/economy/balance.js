// commands/economy/balance.js
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { getUserBalance } = require("../../utils/economy");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("balance")
    .setDescription("Check your balance."),
  async execute(interaction) {
    const userId = interaction.user.id;
    const balance = await getUserBalance(userId);
    // Fetch server currency
    const GuildConfig = require("../../models/GuildConfig");
    let currency = "coins";
    if (interaction.guildId) {
      const config = await GuildConfig.findOne({ guildId: interaction.guildId });
      if (config && config.currency) currency = config.currency;
    }

    const embed = new EmbedBuilder()
      .setColor(0x00ff99)
      .setTitle("Your Balance")
      .setDescription(`💰 **${balance} ${currency}**`)
      .setFooter({ text: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() });

    await interaction.reply({ embeds: [embed] });
  },
};
