## Findings
- The published site now serves the renamed image files correctly: every referenced `menu-images/...` URL audited from live `standalone.html` returns `200 image/*`.
- The preview iframe also reports `184` image elements and `0` failed/broken images.
- What users are likely still experiencing is the combination of heavy eager image loading, duplicate preload/DOM image fetching, very small placeholder/fallback assets, and the welcome overlay dimming the menu while images are still decoding.

## Plan
1. **Fix the menu load strategy**
   - Keep the first visible products high priority.
   - Stop forcing every image to load eagerly at once, which can saturate the browser/network and make images appear missing or slow.
   - Use deterministic above-the-fold eager loading and below-the-fold lazy loading.

2. **Add visible, reliable image states**
   - Add a branded skeleton/background for image boxes while images decode.
   - Fade images in only after `load`, so users see a stable image area instead of blank/washed-out cards.
   - Keep the fallback only for true failures, not as a normal loading state.

3. **Preload only critical images**
   - Retain preload for the first screen only.
   - Remove excessive preloading that competes with actual visible card images.

4. **Add a self-check script inside the page**
   - On page load, detect failed menu images and retry once with an absolute `/menu-images/...` URL.
   - Log a concise warning if any image still fails, making future diagnosis immediate.

5. **Verify after implementation**
   - Re-run local reference checks: no missing files, no unsafe filenames, no broken image refs.
   - Use the browser preview to confirm zero broken images and visible image cards.
   - After you publish/update, the same live audit can confirm all published image URLs return `200`.