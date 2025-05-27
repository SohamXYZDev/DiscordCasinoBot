const mongoose = require("mongoose");

const guildConfigSchema = new mongoose.Schema({
  guildId: {
    type: String,
    required: true,
    unique: true,
  },
  currency: {
    type: String,
    default: "coins",
  },
  disabledGames: {
    type: [String],
    default: [],
  },
  logChannel: {
    type: String,
    default: null,
  },
});

module.exports = mongoose.model("GuildConfig", guildConfigSchema);
