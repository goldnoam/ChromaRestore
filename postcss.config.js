
export default {
  plugins: {
    // Removed 'tailwindcss' to prevent build failure when the module is not in the node_modules.
    // We are using the CDN-based Tailwind import in index.css for reliability.
    autoprefixer: {},
  },
}
