const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const Bet = require("../../models/Bet");
const User = require("../../models/User");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("analytics")
    .setDescription("View your game stats, win/loss ratio, and more!"),
  async execute(interaction) {
    const userId = interaction.user.id;
    const user = await User.findOne({ userId });
    if (!user) {
      return interaction.reply({ content: "❌ User not found.", ephemeral: true });
    }
    // Fetch all bets for this user
    const bets = await Bet.find({ userId });
    if (!bets.length) {
      return interaction.reply({ content: "You haven't played any games yet!", ephemeral: true });
    }
    // Aggregate stats
    let totalWins = 0, totalLosses = 0, totalDraws = 0, netAmount = 0;
    const gameStats = {};
    for (const bet of bets) {
      const { game, result, payout, amount } = bet;
      if (!gameStats[game]) {
        gameStats[game] = { played: 0, wins: 0, losses: 0, draws: 0, net: 0 };
      }
      gameStats[game].played++;
      if (result === "win") {
        totalWins++;
        gameStats[game].wins++;
        gameStats[game].net += payout;
        netAmount += payout;
      } else if (result === "lose") {
        totalLosses++;
        gameStats[game].losses++;
        gameStats[game].net -= amount;
        netAmount -= amount;
      } else if (result === "draw") {
        totalDraws++;
        gameStats[game].draws++;
      }
    }
    const totalGames = totalWins + totalLosses + totalDraws;
    const winRate = totalGames ? ((totalWins / totalGames) * 100).toFixed(1) : "0.0";
    // Most played games
    const sortedGames = Object.entries(gameStats).sort((a, b) => b[1].played - a[1].played);
    const mostPlayed = sortedGames.slice(0, 3).map(([game, stats], i) =>
      `**${i + 1}. ${game.charAt(0).toUpperCase() + game.slice(1)}**: ${stats.played} games`
    ).join("\n");
    // Per-game stats
    const perGameStats = sortedGames.map(([game, stats]) =>
      `**${game.charAt(0).toUpperCase() + game.slice(1)}**\nWins: ${stats.wins} | Losses: ${stats.losses} | Draws: ${stats.draws} | Net: ${stats.net >= 0 ? "+" : "-"}${Math.abs(stats.net)}`
    ).join("\n\n");
    // Embed
    const embed = new EmbedBuilder()
      .setTitle(`📊 Analytics for ${interaction.user.username}`)
      .setColor(0x3498db)
      .setThumbnail(interaction.user.displayAvatarURL())
      .addFields(
        { name: "Total Games Played", value: `${totalGames}`, inline: true },
        { name: "Wins", value: `${totalWins}`, inline: true },
        { name: "Losses", value: `${totalLosses}`, inline: true },
        { name: "Draws", value: `${totalDraws}`, inline: true },
        { name: "Win Rate", value: `${winRate}%`, inline: true },
        { name: "Net Amount Won/Lost", value: `${netAmount >= 0 ? "+" : "-"}${Math.abs(netAmount)}`, inline: true },
        { name: "Most Played Games", value: mostPlayed || "None", inline: false },
        { name: "Per-Game Stats", value: perGameStats || "No data", inline: false }
      )
      .setFooter({ text: `Requested by ${interaction.user.tag}` });
    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
