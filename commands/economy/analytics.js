const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const Bet = require("../../models/Bet");
const User = require("../../models/User");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("analytics")
    .setDescription("View your game stats, win/loss ratio, and more!")
    .addUserOption(option =>
      option.setName("user")
        .setDescription("View another user's stats (Admin only)")
        .setRequired(false)
    ),
  async execute(interaction) {
    const targetUser = interaction.options.getUser("user");
    const isAdmin = interaction.member?.permissions.has(PermissionFlagsBits.Administrator);
    
    // If a user is specified but requester is not admin, deny access
    if (targetUser && !isAdmin) {
      return interaction.reply({ 
        content: "❌ You need Administrator permissions to view other users' stats.", 
        ephemeral: true 
      });
    }
    
    // Determine which user's stats to show
    const userToAnalyze = targetUser || interaction.user;
    const userId = userToAnalyze.id;
    
    const user = await User.findOne({ userId });
    if (!user) {
      return interaction.reply({ 
        content: `❌ ${targetUser ? "That user" : "You"} ${targetUser ? "is" : "are"} not found in the database.`, 
        ephemeral: true 
      });
    }
    // Fetch all bets for this user
    const bets = await Bet.find({ userId });
    if (!bets.length) {
      return interaction.reply({ 
        content: `${targetUser ? userToAnalyze.username : "You"} ${targetUser ? "hasn't" : "haven't"} played any games yet!`, 
        ephemeral: true 
      });
    }
    // Aggregate stats
    let totalWins = 0, totalLosses = 0, totalDraws = 0, totalWagered = 0;
    const gameStats = {};
    for (const bet of bets) {
      const { game, result, payout, amount } = bet;
      totalWagered += amount;
      if (!gameStats[game]) {
        gameStats[game] = { played: 0, wins: 0, losses: 0, draws: 0, net: 0, wagered: 0 };
      }
      gameStats[game].played++;
      gameStats[game].wagered += amount;
      if (result === "win") {
        totalWins++;
        gameStats[game].wins++;
        gameStats[game].net += payout;
      } else if (result === "lose") {
        totalLosses++;
        gameStats[game].losses++;
        gameStats[game].net -= amount;
      } else if (result === "draw") {
        totalDraws++;
        gameStats[game].draws++;
      }
    }
    const totalGames = totalWins + totalLosses + totalDraws;
    // Most played games
    const sortedGames = Object.entries(gameStats).sort((a, b) => b[1].played - a[1].played);
    const mostPlayed = sortedGames.slice(0, 3).map(([game, stats], i) =>
      `**${i + 1}. ${game.charAt(0).toUpperCase() + game.slice(1)}**${stats.played} games`
    ).join("\n");
    // Per-game stats
    const perGameStats = sortedGames.map(([game, stats]) =>
      `**${game.charAt(0).toUpperCase() + game.slice(1)}**\nWins: ${stats.wins} | Losses: ${stats.losses} | Draws: ${stats.draws} | Net: ${stats.net >= 0 ? "+" : "-"}${Math.abs(stats.net)}`
    ).join("\n\n");
    // Embed
    const embed = new EmbedBuilder()
      .setTitle(`📊 Analytics for ${userToAnalyze.username}`)
      .setColor(0x41fb2e)
      .setThumbnail(userToAnalyze.displayAvatarURL())
      .addFields(
        { name: "Total Games Played", value: `${totalGames}`, inline: true },
        { name: "Wins", value: `${totalWins}`, inline: true },
        { name: "Losses", value: `${totalLosses}`, inline: true },
        { name: "Draws", value: `${totalDraws}`, inline: true },
        { name: "Total Amount Wagered", value: `${totalWagered}`, inline: true },
        { name: "Most Played", value: mostPlayed || "None", inline: false },
        { name: "Game Stats", value: perGameStats || "No data", inline: false }
      )
      .setFooter({ text: `Requested by ${interaction.user.tag}${targetUser ? ` | Viewing ${userToAnalyze.tag}` : ""}` });
    
    // Only make it ephemeral if viewing own stats or if admin is viewing someone else's
    const isEphemeral = !targetUser || isAdmin;
    await interaction.reply({ embeds: [embed], ephemeral: isEphemeral });
  },
};
