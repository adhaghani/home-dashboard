/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static HTML export — no Node.js server required, served by Nginx
  output: 'export',

  // Static export cannot use the default image optimization (requires a server)
  images: {
    unoptimized: true,
  },

  // Trailing slash avoids redirect issues with static file serving
  trailingSlash: true,
};

module.exports = nextConfig;
