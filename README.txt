Twitch VOD Chat for YouTube 1.12
====================================

Display a local TwitchDownloader VOD chat JSON over a YouTube video and synchronize the two timelines with a fixed offset. The extension processes the chat locally in the browser.

Features
--------
- Load large Twitch chat JSON files incrementally.
- Fixed chat/video offset with one-second nudges and JSON offset persistence.
- Search chat to find synchronization points.
- Load Twitch VOD chat directly by Twitch VOD ID or URL and fetch it progressively as the video plays.
- First-party Twitch emotes plus BTTV, FFZ, and 7TV emotes when available.
- Clean chat, timestamps, split-message backgrounds, opacity, and scrollbar controls.
- English, Spanish, French, Japanese, Korean, Portuguese, German, and Italian UI.
- No analytics, ads, accounts, or remote JavaScript.

Large chats
-----------
The loader reads large files incrementally instead of creating a single giant JSON string/object. Rendering is limited to the currently visible messages, with event-driven video synchronization plus a low-frequency safety heartbeat.

Offset persistence
------------------
"Save offset to JSON" updates the original JSON file using the File System Access API. The extension stores a small `_tcs_sync` object containing the saved offset. It does not create a second chat copy or reserialize the entire file.

Per-video memory
----------------
The extension remembers the Twitch VOD ID/URL and chat offset separately for each YouTube video. Returning to a previously used YouTube video restores those values.

Third-party emotes
------------------
The extension may request the Twitch channel ID from BTTV, FFZ, and 7TV public APIs so it can display channel/global emotes. API failures do not prevent the chat itself from working.

Installation
------------
1. Unzip the extension folder.
2. Open chrome://extensions/.
3. Enable Developer mode.
4. Click Load unpacked and select the folder containing manifest.json.
5. Open or refresh a YouTube watch page.

Chrome Web Store note
---------------------
The published version uses only the `storage` permission plus host permissions for the third-party emote APIs. It intentionally does not request `activeTab` or `scripting`; after installing or updating the extension, an already-open YouTube tab may need to be refreshed so the bundled content script is loaded.

Chrome 148 or newer is required. The toolbar passes the selected file handle to the YouTube overlay so Save offset to JSON works from either location.
