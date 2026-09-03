/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  distDir: "out",
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
  reactStrictMode: false,
};

export default nextConfig;
