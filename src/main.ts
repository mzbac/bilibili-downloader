import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { Downloader } from "./video-downloader";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const argv = yargs(hideBin(process.argv))
    .option("url", {
      alias: "u",
      description: "URL of the video to download",
      type: "string",
    })
    .help()
    .alias("help", "h")
    .parseSync();

  if (!argv.url) {
    console.error("You must provide a URL to download the video.");
    process.exit(1);
  }

  const downloader = new Downloader();
  downloader.getVideoUrl(argv.url);
  await downloader.getAid();
  for (const page of downloader.pages) {
    downloader.cid = page.cid;
    const info = await downloader.getInfo();

    if (info) {
      downloader.name = `${info.data.title}-${downloader.pid}-${page.part}`;
      console.log("Video Name: ", downloader.name);
    }

    const data = await downloader.getData(false);

    if (data) {
      const outputDir = path.resolve(process.cwd(), "downloads");
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir);
      }

      console.log("Starting download...");
      downloader.links.forEach((link, index) => {
        const filePath = path.join(
          outputDir,
          `${downloader.name}-part${index + 1}.flv`
        );
        const status = downloader.downloadByIndex(
          index,
          filePath,
          (progress: any, taskIndex: number) => {
            console.log(
              `Part ${taskIndex + 1} - Progress: ${progress.percentage.toFixed(
                2
              )}%`
            );
          }
        );

        if (status === "DUPLICATE") {
          console.log(`Part ${index + 1} is already being downloaded.`);
        }
      });
    } else {
      console.error("Failed to get video data.");
    }

    await new Promise((resolve) => setTimeout(resolve, 3000)); // add 3s delay between each video make sure we don't get banned
  }
}
async function download(downloader: Downloader, part: string) {}
main().catch((error) => console.error(error));
