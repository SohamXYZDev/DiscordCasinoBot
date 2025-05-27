const mongoose = require("mongoose");
require("dotenv").config();

async function connectDB() {
  if (mongoose.connection.readyState >= 1) return;

  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("✅ MongoDB connected with Mongoose");
  } catch (err) {
    console.error("MongoDB connection error:", err);
  }
}

module.exports = connectDB;
