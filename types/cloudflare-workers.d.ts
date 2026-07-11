declare module "cloudflare:workers" {
  /* The runtime injects this binding; Wrangler supplies its concrete D1 shape. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const env: { DB?: any };
}
