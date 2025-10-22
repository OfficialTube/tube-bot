const mongoose = require("mongoose");
const BOT_LOG_CHANNEL_ID = "1424584591590555648"; 
const YOUR_USER_ID = "464597977798017024";
const { logOffline, setClient } = require("./utils/logger");

module.exports = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      retryWrites: true,
      family: 4,
      maxPoolSize: 10,
    });
    console.log("✅ Connected to MongoDB");
    logOffline("✅ Connected to MongoDB");
  } catch (err) {
    console.error("❌ MongoDB connection error:", err);
    logOffline("❌ MongoDB connection error");
  }

  // === Reconnection & Event Handlers ===
  mongoose.connection.on("disconnected", () => {
    console.warn("⚠️  MongoDB disconnected. Attempting to reconnect...");
    logOffline("⚠️  MongoDB disconnected. Attempting to reconnect...");
    setTimeout(async () => {
      try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("✅ MongoDB reconnected successfully.");
        logOffline("✅ MongoDB reconnected successfully.");
      } catch (err) {
        console.error("❌ MongoDB reconnection failed:", err);
        logOFfline("❌ MongoDB reconnection failed");
      }
    }, 5000);
  });

  mongoose.connection.on("reconnected", () => {
    console.log("🔄 MongoDB reconnected.");
    logOffline("🔄 MongoDB reconnected.");
  });

  mongoose.connection.on("error", (err) => {
    console.error("❌ MongoDB error:", err);
    logOffline("❌ MongoDB error");
    if (err.message.includes("tlsv1 alert internal error") || err.message.includes("MongoServerSelectionError")) {
    console.log("Restarting bot to fix MongoDB connection...");
    logOffline("Restarting bot to fix MongoDB connection...");
    process.exit(1);
    }
  });
};
