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

  /*
   * Server function calls are not logged, because the log printed a password.
   *
   * Next logs every server action in development as `ƒ name(args) in Nms` —
   * name, ARGUMENTS and duration (see this version's own docs,
   * node_modules/next/dist/docs, logging.md). `createAccount(email, password)`
   * therefore printed a real person's real password into the terminal and
   * into .next/dev/logs/next-development.log, where it sat on disk.
   *
   * There is no way to redact one argument, so the whole line goes. What it
   * costs is a genuinely useful timing — it is how the setup save was
   * measured at 923ms — and that is worth losing: a timing can be recovered
   * with a stopwatch, a leaked password cannot be unleaked. Turn it back on
   * deliberately, for a session, when measuring something that takes no
   * secrets.
   */
  logging: { serverFunctions: false },
};

export default nextConfig;
