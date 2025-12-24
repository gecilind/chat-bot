/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:8000/api/:path*',
      },
      {
        source: '/login',
        destination: 'http://localhost:8000/login',
      },
      {
        source: '/logout',
        destination: 'http://localhost:8000/logout',
      },
    ];
  },
};

module.exports = nextConfig;

