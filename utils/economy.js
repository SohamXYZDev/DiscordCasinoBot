const connectDB = require("../config/db");
const User = require("../models/User");

async function getUserBalance(userId) {
  await connectDB();

  let user = await User.findOne({ userId });

  if (!user) {
    user = await User.create({ userId });
  }

  return user.balance;
}

async function addBalance(userId, amount) {
  await connectDB();

  const user = await User.findOneAndUpdate(
    { userId },
    { $inc: { balance: amount } },
    { new: true, upsert: true } // Creates user if not found
  );

  return user.balance;
}

async function setBalance(userId, amount) {
  await connectDB();

  const user = await User.findOneAndUpdate(
    { userId },
    { $set: { balance: amount } },
    { new: true, upsert: true }
  );

  return user.balance;
}

module.exports = {
  getUserBalance,
  addBalance,
  setBalance,
};
