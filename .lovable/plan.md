## Goal

Replace the image used for **Croissant Avocado and Poached Eggs** (sub-category CROISSANDWICHES) with the user-uploaded image, so it no longer shares the same image as Egg Benedict Croissant. Update both the grid card and the lightbox source.

## Steps

1. **Add the new image asset**
   - Copy `user-uploads://Croissant_Avocado_Poached_Eggs.webp` → `public/menu-images/Croissant_Avocado_Poached_Eggs.webp`

2. **Update `public/standalone.html` — grid card (line 4517)**
   - Change `data-src="menu-images/Egg_Benedict_Croissant.webp"` → `data-src="menu-images/Croissant_Avocado_Poached_Eggs.webp"` on the `<img>` whose `alt="Croissant Avocado and Poached Eggs"`.
   - Leave the Egg Benedict Croissant card (line 4544) untouched.

3. **Update `public/standalone.html` — ITEMS array / lightbox source (line 7065)**
   - In the `ITEMS` entry where `name: "Croissant Avocado and Poached Eggs"`, change `img: "menu-images/Egg_Benedict_Croissant.webp"` → `img: "menu-images/Croissant_Avocado_Poached_Eggs.webp"`.
   - The lightbox reads its image from this `ITEMS` array, so this single change fixes the lightbox.

## Out of scope (not touched)

- Egg Benedict Croissant item and its image
- Any tracking, admin, schema, or `/api/public/track` code
- Any other menu items, descriptions, prices, or layout
