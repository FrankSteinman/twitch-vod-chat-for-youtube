# Twitch VOD Chat for YouTube

A Chrome extension that allows you to display Twitch VOD chats on YouTube.

<img width="2538" height="1360" alt="2026-09-30 04-28-35" src="https://github.com/user-attachments/assets/96ed68f7-c897-4733-ad3e-fa8957c08a81" />

## Features

<img width="431" height="565" alt="toolbar ext" src="https://github.com/user-attachments/assets/eb7b3bd2-ad8d-41fd-88fb-96e9ff2abe4e" />

<img width="471" height="294" alt="overlay" src="https://github.com/user-attachments/assets/6fa941aa-34d3-454c-b891-999cc5f5fe27" />

- Display Twitch VOD chat alongside YouTube videos
- Adjust the chat offset to sync it with the video
- Save the offset back to the original chat JSON
- Search the chat for messages and sync points
- Twitch, BTTV, FFZ, and 7TV emote support
- Support for large chat JSON files
- Clean chat mode
- Show or hide timestamps
- Split messages for easier reading
- Adjustable chat opacity
- Hide the scrollbar while keeping the chat scrollable
- Move the chat in Clean chat mode
- Settings are available from both the extension toolbar and the chat overlay
- English, Spanish, French, Japanese, Korean, Portuguese, German, and Italian

## Installation

This extension is distributed as an unpacked Chrome extension.

1. Download the latest ZIP from the **Releases** section.
2. Extract the ZIP somewhere on your computer.
3. Open `chrome://extensions` in Chrome.
4. Turn on **Developer mode**.
5. Click **Load unpacked**.
6. Select the extracted extension folder.

After installing or updating the extension, refresh any YouTube tabs that were already open.

## Using the extension

Load a Twitch chat JSON file from the extension toolbar or the chat overlay. The extension will synchronize the chat to the YouTube video's current position.

Use the **Offset** controls to adjust the timing. A positive offset moves the displayed Twitch chat forward relative to the YouTube video.

The offset can be saved back to the original JSON file after the chat has been loaded.

## Getting chat files

For the best results, I recommend using [TwitchDownloader](https://github.com/lay295/TwitchDownloader) to download the VOD chat as a **JSON** file.

The downloaded JSON can then be loaded directly into the extension.

## Website

[Visit the website](https://franksteinman.github.io/twitch-vod-chat-for-youtube/)

The website has screenshots and a more detailed overview of the extension's features.

## Privacy

Chat files are processed locally in the browser. The extension does not require an account or a separate service to display the chat.

See `PRIVACY.md` for more information.

## Version

**1.0**

This is a casual project. Updates may be made occasionally when something needs fixing or stops working. All of this was done with the help of ChatGPT.
