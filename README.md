# Twitch VOD Chat for YouTube

Leer en [Español](README.es.md)

A Chrome extension that allows you to display Twitch VOD chats on YouTube.

<img width="2538" height="1360" alt="2026-09-30 04-28-35" src="https://github.com/user-attachments/assets/96ed68f7-c897-4733-ad3e-fa8957c08a81" />

## Features

<img width="426" height="627" alt="toolbar ext 1 13" src="https://github.com/user-attachments/assets/367cc900-5d32-4191-b652-4ff3ab6acc4b" />

<img width="483" height="375" alt="overlay 1 13" src="https://github.com/user-attachments/assets/1bfece7e-8e1c-4dfe-a835-0dfa16e57b86" />


- Display Twitch VOD chat alongside YouTube videos
- Load Twitch VOD URLs or JSON files to load chats
- Adjust the chat offset to sync it with the video
- Save the offset back to the original chat JSON
- Search the chat for messages and sync points
- Twitch, BTTV, FFZ, and 7TV emote support
- Support for large chat JSON files
- Clean chat mode for a minimal look (can move the chat in clean chat mode by clicking near the top of the chat)
- Show or hide timestamps
- Split messages for easier reading (also includes a color picker)
- Adjustable chat opacity
- Resizable chat size by dragging on the sides
- Hide the scrollbar while keeping the chat scrollable
- Settings are available from both the extension toolbar and the chat overlay
- Supports: English, Spanish, French, Japanese, Korean, Portuguese, German, and Italian

## Installation

This extension is distributed as an unpacked Chrome extension.

1. Download the latest ZIP from the [**Releases**](https://github.com/FrankSteinman/twitch-vod-chat-for-youtube/releases) section.
2. Extract the ZIP somewhere on your computer.
3. Open `chrome://extensions` in Chrome.
4. Turn on **Developer mode**.
5. Click **Load unpacked**.
6. Select the extracted extension folder.

After installing or updating the extension, refresh any YouTube tabs that were already open.

## Using the extension

You can either enter the URL of the Twitch VOD or load a Twitch chat JSON file from the extension toolbar or the chat overlay. The extension will synchronize the chat to the YouTube video's current position.

Use the **Offset** controls to adjust the timing. A positive offset moves the displayed Twitch chat forward relative to the YouTube video.

The offset can be saved back to the original JSON file after the chat has been loaded.

## Getting chat files

I recommend using [TwitchDownloader](https://github.com/lay295/TwitchDownloader) to download the VOD chat as a **JSON** file. I enabled 3rd Party Emotes when downloading the chat and that worked for me. 

The downloaded JSON can then be loaded directly into the extension.

## Privacy

Chat files are processed locally in the browser. The extension does not require an account or a separate service to display the chat.

See `PRIVACY.md` for more information.

## Current Version

**1.12**

This is a casual project. Updates may be made occasionally when something needs fixing or stops working. All of this was done with the help of ChatGPT.
