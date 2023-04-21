import fs from "fs";
import crypto from "crypto";
import http from "http";
import https from "https";
import progress from "progress-stream";
import fetch from "node-fetch";
import { JSDOM } from "jsdom";

interface VideoData {
  aid: number;
  pages: Page[];
}

interface EpInfo {
  aid: number;
  cid: number;
}

interface EpList {
  aid: number;
  cid: number;
}
interface Page {
  cid: number;
  part: string;
}

interface InitialState {
  videoData?: VideoData;
  epInfo?: EpInfo;
  epList?: EpList[];
  pages: Page[];
}

interface DataResult {
  fallback: boolean;
  data: any;
}

const $ = (selector: string) => new JSDOM(selector).window.$;

class Task {
  constructor(public url: string) {
    this.finished = false;
  }

  public finished: boolean;
}

class Downloader {
  public type = "";
  public id = "";
  public url = "";
  public aid = -1;
  public pid = 1;
  public cid = -1;
  public name = "";
  public links: string[] = [];
  public tasks: Task[] = [];
  public pages: Page[] = [];

  getVideoUrl(videoUrl: string) {
    this.url = "";
    const mapping: { [key: string]: string } = {
      BV: "https://www.bilibili.com/video/",
      bv: "https://www.bilibili.com/video/",
      av: "https://www.bilibili.com/video/",
      ep: "https://www.bilibili.com/bangumi/play/",
      ss: "https://www.bilibili.com/bangumi/play/",
    };

    for (const [key, value] of Object.entries(mapping)) {
      if (videoUrl.includes(key)) {
        this.type = key;
        this.id = key + videoUrl.split(key)[1];
        this.url = value + this.id;
        break;
      }
    }
  }

  async getAid(): Promise<void> {
    const { type, url } = this;
    if (!url) return;
    return fetch(url)
      .then((response) => response.text())
      .then((result) => {
        let data = result.match(/__INITIAL_STATE__=(.*?);\(function\(\)/)![1];
        const state = JSON.parse(data) as InitialState;
        // console.log("INITIAL STATE", data);
        if (type === "BV" || type === "bv" || type === "av") {
          this.aid = state.videoData!.aid;
          this.pid = parseInt(url.split("p=")[1], 10) || 1;
          this.cid = state.videoData!.pages[this.pid - 1].cid;
        } else if (type === "ep") {
          this.aid = state.epInfo!.aid;
          this.cid = state.epInfo!.cid;
        } else if (type === "ss") {
          this.aid = state.epList![0].aid;
          this.cid = state.epList![0].cid;
        }
        this.pages = state.videoData.pages;
      })
      .catch((error) => console.error("获取视频 aid 出错！"));
  }

  async getInfo() {
    const { aid, cid } = this;
    if (!cid) {
      console.error("获取视频 cid 出错！");
      return;
    }
    return fetch("https://api.bilibili.com/x/web-interface/view?aid=" + aid)
      .then<{ data: { title: string } }>((response) => response.json() as any)
      .catch((error) => console.error("获取视频信息出错！"));
  }

  async getData(fallback: boolean): Promise<DataResult | void> {
    const { cid, type } = this;
    let playUrl;
    if (fallback) {
      const params = `cid=${cid}&module=movie&player=1&quality=112&ts=1`;
      const sign = crypto
        .createHash("md5")
        .update(params + "9b288147e5474dd2aa67085f716c560d")
        .digest("hex");
      playUrl = `https://bangumi.bilibili.com/player/web_api/playurl?${params}&sign=${sign}`;
    } else {
      if (type === "BV" || type === "bv" || type === "av") {
        const params = `appkey=iVGUTjsxvpLeuDCf&cid=${cid}&otype=json&qn=112&quality=112&type=`;
        const sign = crypto
          .createHash("md5")
          .update(params + "aHRmhWMLkdeMuILqORnYZocwMBpMEOdt")
          .digest("hex");
        playUrl = `https://interface.bilibili.com/v2/playurl?${params}&sign=${sign}`;
      } else {
        playUrl = `https://api.bilibili.com/pgc/player/web/playurl?qn=80&cid=${cid}`;
      }
    }
    return fetch(playUrl)
      .then((response) => response.text())
      .then((result) => {
        const data = fallback ? this.parseData(result) : JSON.parse(result);
        const target = data.durl || data.result.durl;
        console.log("PLAY URL", data);
        if (target) {
          this.links = target.map((part: any) => part.url);
          return {
            fallback,
            data,
          };
        } else {
          if (fallback) throw Error();
          return this.getData(true);
        }
      })
      .catch((error) => {
        console.error(
          "获取 PlayUrl 或下载链接出错！由于B站限制，只能下载低清晰度视频。"
        );
      });
  }

  parseData(target: string) {
    const data = $(target);
    const result: any = {};
    result.durl = [];
    result.quality = data.find("quality").text();
    data.find("durl").each((i: number, o: any) => {
      const part = $(o);
      result.durl.push({
        url: part.find("url").text(),
        order: part.find("order").text(),
        length: part.find("length").text(),
        size: part.find("size").text(),
      });
    });
    return result;
  }

  downloadByIndex(part: number, file: string, callback: Function = () => {}) {
    const { url } = this;

    if (this.tasks.some((item) => item.url === this.links[part]))
      return "DUPLICATE";
    this.tasks.push(new Task(this.links[part]));
    let state;
    try {
      state = fs.statSync(file);
    } catch (error) {}
    const options = {
      url: this.links[part],
      headers: {
        Range: `bytes=${state ? state.size : 0}-`, //断点续传
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.212 Safari/537.36",
        Referer: url,
      },
    };
    const stream = fs.createWriteStream(file, state ? { flags: "a" } : {});
    this.download(options, stream, callback);

    return state;
  }

  download(options: any, stream: fs.WriteStream, callback: Function) {
    const index = this.tasks.findIndex((item) => item.url === options.url);
    const proStream = progress({
      time: 250, //单位ms
    }).on("progress", (progress: any) => {
      const { percentage } = progress; //显示进度条
      if (percentage === 100) {
        this.tasks[index].finished = true;
      }
      callback(progress, index);
    });

    function downloadLink(url: string) {
      (url.startsWith("https") ? https : http).get(url, options, (res) => {
        if (res.statusCode === 302) {
          url = res.headers.location;
          return downloadLink(url);
        }
        proStream.setLength(Number(res.headers["content-length"]));
        //先pipe到proStream再pipe到文件的写入流中
        res
          .pipe(proStream)
          .pipe(stream)
          .on("error", (error: any) => {
            console.error(error);
          });
      });
    }
    downloadLink(options.url);
  }
}

export { Task, Downloader };
