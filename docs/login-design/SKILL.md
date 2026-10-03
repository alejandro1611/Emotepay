---
name: emotepay-login-design
description: Visual rules for changes to app/login.tsx. Read when adjusting the login presentation.
---

# Login design

User direction: enlarge the card, enlarge and center the logo, and place the EmotePay name below it. Keep other content and behavior unchanged.

- Follow the supplied reference: purple gradients, large cropped circular shapes, centered white content and a white primary action. Use a dark translucent #160a30/80 card over the purple background to preserve text readability.
- Card occupies 75vw by 75dvh and stays centered. Internal vertical scrolling preserves access to controls on short screens without changing the requested proportions. Content remains at most 36rem wide so buttons and copy remain readable inside the larger card.
- Logo and name form a centered vertical column. Logo is 192px on mobile and 256px from 640px, constrained by the available width. Name scales from 32px to 48px on mobile and uses 60px from 640px with font-black. This follows the user's correction that both must stand out more, while keeping the wordmark inside the card on narrow screens.
- Use the existing Inter layout font; globals also contain Arial and undefined Geist tokens. Do not change global typography in this scoped adjustment.
- Preserve Privy login, readiness states and redirect to `/`; show “Ingresando…” during the authenticated transition without adding a redirect delay.
- Animate content once with opacity and an 8px vertical offset over 250ms. The user explicitly requested continuously moving background bubbles: use five CSS circles with staggered 22–36 second transform-only drift, clipped to the page. Disable entrance, bubble and spinner motion for prefers-reduced-motion. Decorative circles are aria-hidden and never receive pointer events.
- On short viewports scale the logo with viewport height, up to the previously requested 192px/256px, and reduce branding gaps to improve access to the login button. Preserve 75vw/75dvh card dimensions and internal scrolling.
- Keep login copy brief and readable. Do not add privacy or terms links until real destinations exist.
- Below payment copy, show a centered wrapping row of Kick, Twitch, Facebook, TikTok and YouTube logos at 36px, in white for contrast. Use local Simple Icons SVG assets and accessible brand names. These are decorative platform references, not login methods or claims of implemented integrations.
- A reference image was supplied showing a purple welcome panel with large gradient circles around its edges. Adapt the composition to EmotePay login without adding unrelated navigation or placeholder copy.
- Optional Kero companion skills are not installed; use kero-method principles directly.
- Verification must distinguish code/build checks from a browser visual audit. Do not claim visual audit success without rendered measurements.
