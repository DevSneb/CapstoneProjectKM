const path = require('path')
const { defineConfig } = require('@vue/cli-service')

// Html-webpack-plugin emits processed index.html from public/index.html. Copy-webpack-plugin
// must not copy that same source file again (Webpack 5 rejects duplicate asset names).
module.exports = defineConfig({
  chainWebpack(config) {
    config.plugin('copy').tap((args) => {
      args[0].patterns.forEach((pattern) => {
        const prev = pattern.filter
        pattern.filter = async (resourcePath) => {
          if (path.basename(resourcePath).toLowerCase() === 'index.html') {
            return false
          }
          if (prev) {
            const r = prev(resourcePath)
            return typeof r?.then === 'function' ? await r : r
          }
          return true
        }
      })
      return args
    })
  },
  devServer: {
    proxy: {
      '^/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
        logLevel: 'warn'
      }
    }
  }
})
