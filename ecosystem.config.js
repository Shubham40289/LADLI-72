module.exports = {
  apps: [{
    name: "ladli72-api",
    script: "./server.js",
    instances: "max", // Uses all available CPU cores
    exec_mode: "cluster",
    watch: false,
    env: {
      NODE_ENV: "production",
      PORT: 3000
    }
  }]
}
