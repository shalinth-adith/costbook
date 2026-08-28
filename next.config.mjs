/** @type {import('next').NextConfig} */
const nextConfig = {
  // Typed routes are worth having, but they reject links to screens that do
  // not exist yet — and right now only the cost sheet does. Turn this back on
  // once the dashboard, ingredients, import and settings routes land, so the
  // nav is checked rather than trusted.
  typedRoutes: false,
};

export default nextConfig;
