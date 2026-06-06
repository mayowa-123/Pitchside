# Project Handover: Pitchside Video Layout Enhancements

## Project Overview
The goal is to enhance the **Pitchside** football social app by implementing **TikTok-style** and **Facebook-style** video layouts. This includes vertical swipe navigation, social engagement buttons (Like, Comment, Repost, Save), and specialized video clipping/branding removal for embedded content.

## What has been done
- **TikTok Layout Implementation**:
  - Created a vertical swipe engine in `app.js` using `TouchStart` and `TouchEnd` events.
  - Implemented `navigateVideo(direction)` with CSS animations (`swipe-out-up`, `swipe-in-up`, etc.) for smooth transitions.
  - Added social action overlays: Like (with heart animation), Comment, Repost, Save, and Music labels.
  - Implemented a "Verified Official" badge for API-sourced content.
  - Developed an **Iframe Clipping System** in `renderVideoEmbed` that over-scales iframes (130% height, -12% top) to hide YouTube/external player branding and ads.
  - Added a global **Mute/Unmute** controller (`tt-speaker-btn`) that synchronizes state across native videos and cross-origin iframes using `postMessage` and Web Audio Gain nodes.
- **UI/UX Styling**:
  - Defined the `.video-player-wrap` and `.tt-side-actions` in `style.css`.
  - Added glass-morphism effects for AI analysis overlays.
  - Implemented marquee animations for music labels.

## What is currently being done
- **Codebase Review**: Verifying the integration of the `tt-` (TikTok) elements within the main `index.html` and `app.js` flows.
- **Refinement**: Ensuring the `openHlPlayerById` function correctly initializes the TikTok-style overlay for all video types (Official, Fan, Player).

## What is yet to do (The Facebook Layout & More)
1. **Facebook-style Layout**:
   - Implement a secondary layout mode that mimics the Facebook "Watch" or "Reels" feed.
   - This should likely be a scrollable vertical feed where videos autoplay as they enter the viewport (Intersection Observer is already partially implemented but needs refinement for this mode).
   - Add Facebook-specific engagement icons (Like, Love, Haha, Wow, Sad, Angry reactions).
2. **Layout Toggle**:
   - Add a UI switch to allow users to toggle between "TikTok Mode" (Snap-to-video swipe) and "Facebook Mode" (Continuous scroll feed).
3. **Engagement Features**:
   - Fully wire the "Comment" button to open the existing `comment-overlay`.
   - Implement the "Share" functionality to generate deep links or social share intents.
4. **Data Integration**:
   - Ensure the `VIDEOS` array (populated via Firebase/API) contains all necessary metadata for the new layouts (e.g., `poster_avatar`, `music_name`, `like_count`).

## Technical Notes for the next AI
- **Main Files**: `app.js` (Logic), `style.css` (Styles), `index.html` (Structure).
- **Key Functions**:
  - `renderVideoEmbed(v)`: Handles the complex iframe clipping and video loading.
  - `navigateVideo(direction)`: Manages the vertical swipe state and animations.
  - `toggleMute()`: The master audio controller.
- **CSS Animations**: Look for `@keyframes slideOutUp` etc., in `style.css` for the swipe effects.
- **Iframe Control**: Note the use of `postMessage` to communicate with YouTube/JWPlayer iframes for muting.

---
*Status: TikTok layout functional; Facebook layout pending.*
