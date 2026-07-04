# Storybook Publishing On Cloudflare

Lachesi Storybook is prepared for a public static deployment on Cloudflare Pages at:

```txt
https://design-system.lachesi.dev
```

## Build

```sh
pnpm storybook:build
```

The static output is written to `storybook-static/`.

## Cloudflare Pages

Create a Cloudflare Pages project connected to the GitHub repository.

Use these build settings:

```txt
Framework preset: None
Build command: pnpm storybook:build
Build output directory: storybook-static
Root directory: /
Production branch: main
```

Cloudflare Pages starts from the repository root unless a root directory is configured, then uploads the build output directory as the site contents.

## Custom Domain

Attach this custom domain to the Cloudflare Pages project:

```txt
design-system.lachesi.dev
```

If `lachesi.dev` is already managed in Cloudflare DNS, Cloudflare can create or validate the required DNS record from the Pages custom domain flow.

## Static Headers

`public/storybook/_headers` is copied into the Storybook static output. Cloudflare Pages parses that file and applies the configured static response headers.
