# @zintrust/ui

Vanilla-JS, framework-free UI components and static dashboard pages for ZinTrust.

Drop-in usage

- Serve files from `packages/ui/public/<page>/` or copy `packages/ui/src` to your static host.
- Include `styles.css` and `main.js` from the desired page and mount in any server-rendered HTML.

Contributing

- Implement shared components in `src/components/` and pages in `src/<page>/`.
- Keep components framework-agnostic and use ESM exports.
