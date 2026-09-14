/** @type {import('next').NextConfig} */
const nextConfig = {
  // Typed routes are worth having, but they reject links to screens that do
  // not exist yet — and right now only the cost sheet does. Turn this back on
  // once the dashboard, ingredients, import and settings routes land, so the
  // nav is checked rather than trusted.
  typedRoutes: false,

  /*
   * The dev indicator, off.
   *
   * Next draws a round badge over the page in development — bottom-left by
   * default, which on the dashboard sits on top of "Everything you have
   * written down" in the first count card. It never ships (a production build
   * has no badge), but this book is read on screen while it is being built
   * and screenshots of it are how the work is checked, so a control that
   * covers the content is worth the loss.
   *
   * Compile and runtime errors are still surfaced with this off — that is the
   * documented behaviour, not an assumption (node_modules/next/dist/docs,
   * 01-app/03-api-reference/05-config/01-next-config-js/devIndicators.md).
   * Set `devIndicators: { position: 'bottom-right' }` instead of `false` to
   * have it back somewhere else.
   */
  devIndicators: false,
};

export default nextConfig;
