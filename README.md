# Bilibili Video Downloader

A command-line tool to download videos from Bilibili in Node.js and TypeScript.

## Features

- Download videos from Bilibili
- Support for different video URLs (BV, av, ep, ss)
- Convert downloaded FLV videos to MP4

## Prerequisites

- Node.js (v14 or higher)
- FFmpeg (for video conversion)

## Installation

```
npm install
```

## Usage

Run the tool using the following command:

```
npx tsx ./src/main.ts --url <video_url>
```

To convert FLV files to MP4, run the following command:

```
npx tsx ./src/convert.ts
```

Make sure to update the file paths in the convert.ts file to match the actual location of your FLV files.
