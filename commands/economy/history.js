const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const Bet = require("../../models/Bet");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("history")
    .setDescription("View your recent bet history."),
  async execute(interaction) {
    const userId = interaction.user.id;
    const bets = await Bet.find({ userId }).sort({ timestamp: -1 }).limit(10);
    if (!bets.length) {
      return interaction.reply({ content: "You have no bet history yet!", ephemeral: true });
    }
    const embed = new EmbedBuilder()
      .setTitle("📝 Your Bet History")
      .setColor(0x41fb2e)
      .setDescription(
        bets.map(bet => {
          const date = bet.timestamp.toLocaleString();
          return `**${bet.game.toUpperCase()}** | Bet: ${bet.amount} | Result: ${bet.result} | Payout: ${bet.payout} | ${date}`;
        }).join("\n")
      );
    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
