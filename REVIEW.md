# Textlift — Build Review

This file exists only to create a reviewable PR. All code is already deployed on `main`.

**Merge this PR to acknowledge the build.** Closing without merging is also fine.

## Links

- **GitHub Pages:** https://ben-gy.github.io/textlift/ *(redirects to custom domain once DNS is set)*
- **Custom domain:** https://textlift.benrichardson.dev

## DNS setup

Already provisioned automatically in Cloudflare (`benrichardson.dev` zone):

| Type | Name | Target | Proxy |
|------|------|--------|-------|
| CNAME | `textlift` | `ben-gy.github.io` | DNS only (grey cloud) |

If the cert ever needs re-issuing:

```bash
gh api repos/ben-gy/textlift/pages -X PUT -f cname=""
sleep 3
gh api repos/ben-gy/textlift/pages -X PUT -f cname="textlift.benrichardson.dev"
```
