const mongoose = require("mongoose");

const betSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  game: { type: String, required: true },
  amount: { type: Number, required: true },
  result: { type: String, required: true }, // win, lose, draw
  payout: { type: Number, required: true },
  timestamp: { type: Date, default: Date.now },
  details: { type: Object }, // optional, for extra info
});

module.exports = mongoose.model("Bet", betSchema);
