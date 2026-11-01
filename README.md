# 🍎 Fetchapple
Developed by Riyas Aslam M

Paste a link -> pick quality -> download. Runs entirely on Netlify (no PC needed).

## Deploy (one time)
1. Unzip, then drag the whole `Fetchapple` folder onto https://app.netlify.com/drop
   (use a NEW site so other projects are not overwritten).
2. Open the site URL. Paste an X/Twitter link to test.

If the page loads but says "Server functions not found", the drop did not include the
functions. Use one of these instead (still one time):
- Upload the folder to a GitHub repo -> Netlify -> Add new site -> Import from Git.
- Or run once in the folder:  npx netlify-cli deploy --prod --dir=.

## What works out of the box
- X/Twitter videos (all available qualities), GIFs and photos.

## Enable YouTube, Instagram, Facebook, Snapchat
These sites block Netlify's servers and Netlify cannot run yt-dlp/ffmpeg, so Fetchapple
uses a Cobalt-compatible API for them.
Netlify -> Site configuration -> Environment variables, add:
- COBALT_API_URL   e.g. https://your-cobalt-instance.example.com
- COBALT_API_KEY   (only if your instance needs one)
Then redeploy. Public cobalt servers usually need a key; self-hosting one is another option.

## Optional password
Add ACCESS_TOKEN in the same place, redeploy, then enter it in the page under Settings.
Recommended, so strangers cannot use your site.

## Save location
- Laptop (Chrome/Edge): Save to -> Choose a folder (X/Twitter files).
- iPhone: Files -> Downloads (Settings -> Safari -> Downloads to change).
- Android: Chrome Downloads folder.

For personal use. Download only content you own or have permission to save.
