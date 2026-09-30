# Privacy Policy — Twitch VOD Chat for YouTube

Last updated: September 30, 2026

Twitch VOD Chat for YouTube is a browser extension that displays a user-selected TwitchDownloader chat JSON file alongside a YouTube video. The extension is designed to process the chat locally in the browser.

## Data handled

The extension can process the contents of a Twitch chat JSON file selected by the user. This can include Twitch usernames, message text, timestamps, colors, and emote information contained in that file. The extension also accesses the current YouTube video page because that is required to synchronize the chat with the video.

The extension stores user preferences such as language, chat visibility, appearance settings, and synchronization offset in Chrome local storage. When the user chooses **Save offset to JSON**, the extension writes the saved offset back to the user-selected JSON file using the browser's File System Access API.

The extension does **not** collect analytics, advertising identifiers, browsing histories, account credentials, or payment information. It does not upload the user's Twitch chat JSON to the extension developer or to a developer-controlled server.

## Third-party services

To display BTTV, FrankerFaceZ, and 7TV emotes, the extension may send the Twitch channel ID associated with the selected chat to those services' public APIs. Emote images may also be requested from their public content-delivery networks. These services are operated by their respective providers and are subject to their own privacy policies.

The extension does not send the full Twitch chat log to those services.

## Data sharing and advertising

The extension does not sell user data, use it for advertising, or transfer it to third parties for advertising or unrelated purposes.

## Security

Network requests made by the extension to supported third-party services use HTTPS. Locally selected chat files are processed in the browser, and file writes occur only when the user explicitly chooses to save an offset.

## Changes

This policy may be updated if the extension's data practices change.
