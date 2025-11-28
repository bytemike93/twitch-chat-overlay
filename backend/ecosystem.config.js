module.exports = {
  apps: [{
    name: "chatbackend",
    script: "./server.js",
    env: {
      NODE_ENV: process.env.NODE_ENV || "production",
      PORT: process.env.PORT || "3010",
      USE_LOCAL_FRONTEND: String(process.env.USE_LOCAL_FRONTEND ?? "false"),
      TWITCH_CLIENT_ID: process.env.TWITCH_CLIENT_ID,
      TWITCH_CLIENT_SECRET: process.env.TWITCH_CLIENT_SECRET,
      ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS || "https://chat.bytemike.de",
      OVERLAY_ADMIN_SECRET: process.env.OVERLAY_ADMIN_SECRET
    }
  }]
};
