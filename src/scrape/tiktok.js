/**
 * tiktok.js — TikTok Scraper & Downloader
 *
 * @author  ShanMolvyr
 * @repo    https://code.vyrgo.cyou/shanmolvyr/tiktok
 * @version 1.0.0
 *
 * Directly hits TikTok's internal mobile API — no browser, no WAF.
 * Supports video and slideshow (photo post) download.
 *
 * DO NOT REMOVE THIS HEADER — keep credit intact when forking or modifying.
 */

import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';
import sharp from "sharp";
const apkg = await import('axios-retry')
const axiosRetry = apkg?.default || apkg

const VERBOSE = process.argv.includes('--verbose') || process.argv.includes('-v');
const log = (...args) => { if (VERBOSE) process.stderr.write(args.join(' ') + '\n'); };

const _AUTHOR = 'ShanMolvyr';
const _REPO   = 'code.vyrgo.cyou/shanmolvyr/tiktok';

const DEVICE = {
  device_id:              '7318517321748022790',
  iid:                    '7318518857994389254',
  device_type:            'Pixel 7',
  device_brand:           'Google',
  os_version:             '13',
  os_api:                 '33',
  resolution:             '1080*2400',
  dpi:                    '420',
  version_code:           '350103',
  version_name:           '35.1.3',
  manifest_version_code:  '2023501030',
  update_version_code:    '2023501030',
  ab_version:             '35.1.3',
  channel:                'googleplay',
  build:                  'TQ3A.230901.001',
};

const MOBILE_UA = `com.zhiliaoapp.musically/${DEVICE.manifest_version_code} (Linux; U; Android ${DEVICE.os_version}; en_ID; ${DEVICE.device_type}; Build/${DEVICE.build}; Cronet/TTNetVersion:d0a7e9ec 2024-11-05 QuicVersion:ac6fdc24 2024-10-14)`;

const MOBILE_ENDPOINTS = [
  'https://api16-normal-c-useast1a.tiktokv.com/aweme/v1/feed/',
  'https://api19-normal-c-useast1a.tiktokv.com/aweme/v1/feed/',
  'https://api-h2.tiktokv.com/aweme/v1/feed/',
  'https://api.tiktokv.com/aweme/v1/feed/',
  'https://api16-normal-useast5.us.tiktokv.com/aweme/v1/feed/',
];

function createClient() {
  const jar = new CookieJar();
  const client = wrapper(axios.create({
    jar,
    withCredentials: true,
    timeout: 15000,
    maxRedirects: 5,
  }));

  axiosRetry(client, {
    retries: 2,
    retryDelay: (n) => n * 1500,
    retryCondition: (e) => !e.response || e.response.status === 429 || e.response.status >= 500,
  });

  return client;
}

function extractVideoId(url) {
  const m = url.match(/\/(?:video|photo|v)\/(\d+)/);
  return m ? m[1] : null;
}

async function resolveUrl(client, url) {
  log('⏳ Resolving URL...');
  try {
    const res = await client.get(url, {
      headers: { 'User-Agent': MOBILE_UA },
      maxRedirects: 10,
      validateStatus: () => true,
    });
    const final = res.request?.res?.responseUrl || res.config?.url || url;
    log(`✅ Resolved → ${final}`);
    return final;
  } catch (e) {
    log(`⚠️  Resolve gagal: ${e.message}`);
    return url;
  }
}

function buildParams(videoId) {
  return new URLSearchParams({
    aweme_id:               videoId,
    aid:                    '1233',
    app_name:               'musical_ly',
    device_platform:        'android',
    os:                     'android',
    ssmix:                  'a',
    device_type:            DEVICE.device_type,
    device_brand:           DEVICE.device_brand,
    os_version:             DEVICE.os_version,
    os_api:                 DEVICE.os_api,
    channel:                DEVICE.channel,
    version_code:           DEVICE.version_code,
    version_name:           DEVICE.version_name,
    manifest_version_code:  DEVICE.manifest_version_code,
    update_version_code:    DEVICE.update_version_code,
    ab_version:             DEVICE.ab_version,
    resolution:             DEVICE.resolution,
    dpi:                    DEVICE.dpi,
    device_id:              DEVICE.device_id,
    iid:                    DEVICE.iid,
    language:               'en',
    app_language:           'en',
    region:                 'SG',
    sys_region:             'SG',
    timezone_name:          'Asia/Jakarta',
    timezone_offset:        '25200',
    ac:                     'wifi',
    ac2:                    'wifi5g',
    is_pad:                 '0',
    app_type:               'normal',
    build_number:           DEVICE.version_name,
    last_install_time:      '1706000000',
    ts:                     Math.floor(Date.now() / 1000).toString(),
  });
}

async function fetchViaMobileApi(client, videoId) {
  const params = buildParams(videoId);

  const headers = {
    'User-Agent':     MOBILE_UA,
    'Accept':         'application/json',
    'Accept-Language':'en-US,en;q=0.9',
    'Connection':     'keep-alive',
    'X-Gorgon':       '0404b0d30000',
    'X-Khronos':      Math.floor(Date.now() / 1000).toString(),
    'X-Argus':        '',
    'X-Ladon':        '',
    'sdk-version':    '2',
    'passport-sdk-version': '19',
  };

  let lastErr = null;

  for (const endpoint of MOBILE_ENDPOINTS) {
    log(`⏳ Mencoba ${endpoint.replace('https://', '').split('/')[0]}...`);
    try {
      const res = await client.get(`${endpoint}?${params}`, {
        headers,
        validateStatus: (s) => s < 500,
      });

      if (res.status === 403 || res.status === 401) {
        log(`⚠️  ${res.status} di endpoint ini`);
        lastErr = new Error(`HTTP ${res.status}`);
        continue;
      }

      const data = res.data;
      if (typeof data !== 'object') {
        log(`⚠️  Non-JSON: ${String(data).slice(0, 100)}`);
        lastErr = new Error('Non-JSON response');
        continue;
      }

      if (data.status_code !== 0) {
        log(`⚠️  API status_code: ${data.status_code}`);
        lastErr = new Error(`API error: ${data.status_code}`);
        continue;
      }

      const aweme = data.aweme_list?.[0];
      if (!aweme) {
        lastErr = new Error('aweme_list kosong');
        continue;
      }

      return aweme;

    } catch (e) {
      log(`⚠️  ${e.message.slice(0, 80)}`);
      lastErr = e;
    }
  }

  throw lastErr ?? new Error('Semua endpoint gagal');
}

async function fetchViaWebApi(client, videoId) {
  process.stderr.write('⏳ Fallback ke web API...\n');

  const params = new URLSearchParams({
    itemId: videoId,
    aid: '1988',
    app_language: 'en',
    app_name: 'tiktok_web',
    browser_language: 'en-US',
    browser_name: 'Mozilla',
    browser_online: 'true',
    browser_platform: 'Win32',
    browser_version: '5.0 (Windows)',
    channel: 'tiktok_web',
    cookie_enabled: 'true',
    device_platform: 'web_pc',
    focus_state: 'true',
    from_page: 'video',
    is_fullscreen: 'false',
    is_page_visible: 'true',
    language: 'en',
    os: 'windows',
    region: 'SG',
    screen_height: '1080',
    screen_width: '1920',
    tz_name: 'Asia/Jakarta',
  });

  const res = await client.get(
    `https://www.tiktok.com/api/item/detail/?${params}`,
    {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Referer': `https://www.tiktok.com/@user/video/${videoId}`,
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
      },
      validateStatus: (s) => s < 500,
    }
  );

  const data = res.data;

  if (typeof data !== 'object') {
    const raw = String(data).slice(0, 300);
    fs.writeFileSync('debug_web_api.txt', String(data).slice(0, 5000));
    throw new Error(`Web API non-JSON. Preview: ${raw}`);
  }

  if (data.statusCode !== 0 && data.status_code !== 0) {
    throw new Error(`Web API error: ${data.statusCode ?? data.status_code}`);
  }

  const item = data.itemInfo?.itemStruct || data.item;
  if (!item) throw new Error('itemStruct tidak ada di web API response');

  log('✅ Web API berhasil');
  return item;
}

function normalize(item) {
  const author   = item.author   || item.aweme_author || {};
  const music    = item.music    || {};
  const stats    = item.statistics || item.stats || item.statsV2 || {};
  const video    = item.video    || {};
  const imagePost = item.image_post_info || item.imagePost || null;

  const bitRates = video.bit_rate || video.bitrateInfo || [];

  const sortedBitrates = [...bitRates].sort((a, b) => (b.bit_rate || b.bitrate || 0) - (a.bit_rate || a.bitrate || 0));

  let videoUrls = [];
  for (const b of sortedBitrates) {
    const list = b.play_addr?.url_list || b.PlayAddr?.UrlList || b.playAddr?.urlList || [];
    videoUrls.push(...list);
  }

  if (!videoUrls.length) {
    const playAddr = video.play_addr || video.playAddr;
    const dlAddr   = video.download_addr || video.downloadAddr;
    if (playAddr?.url_list)     videoUrls.push(...playAddr.url_list);
    else if (playAddr?.urlList) videoUrls.push(...playAddr.urlList);
    if (dlAddr?.url_list)       videoUrls.push(...dlAddr.url_list);
    else if (dlAddr?.urlList)   videoUrls.push(...dlAddr.urlList);
  }

  videoUrls = [...new Set(videoUrls.filter(s => typeof s === 'string' && s.startsWith('http')))];

  const getBt = (u) => { const m = u.match(/[&?]bt=(\d+)/); return m ? parseInt(m[1], 10) : 0; };
  const bestUrl = [...videoUrls].sort((a, b) => getBt(b) - getBt(a)).find(u => u.includes('tiktokcdn.com'))
    || [...videoUrls].sort((a, b) => getBt(b) - getBt(a))[0]
    || null;

  const bestBitrate = sortedBitrates[0];
  const videoQuality = bestBitrate ? {
    bitrate:    bestBitrate.bit_rate || bestBitrate.bitrate || null,
    codecType:  bestBitrate.codec_type || bestBitrate.codecType || null,
    definition: bestBitrate.quality_type !== undefined ? String(bestBitrate.quality_type) : null,
  } : null;

  let images = [];
  const imgList = imagePost?.images || imagePost?.image_list || [];
  for (const img of imgList) {
    const urlList = img.display_image?.url_list || img.imageURL?.urlList || img.imageUrl?.urlList || [];
    const url = urlList.at(-1) || urlList[0];
    if (url) images.push({ url, width: img.image_width || img.imageWidth, height: img.image_height || img.imageHeight });
  }

  const digg    = Number(stats.digg_count    || stats.diggCount    || 0);
  const share   = Number(stats.share_count   || stats.shareCount   || 0);
  const comment = Number(stats.comment_count || stats.commentCount || 0);
  const play    = Number(stats.play_count    || stats.playCount    || 0);
  const collect = Number(stats.collect_count || stats.collectCount || 0);

  const uid      = author.uid        || author.id        || null;
  const uniqueId = author.unique_id  || author.uniqueId  || null;
  const nickname = author.nickname   || null;
  const avatar   = author.avatar_thumb?.url_list?.[0] || author.avatarThumb || null;
  const avatarM  = author.avatar_medium?.url_list?.[0] || author.avatarMedium || null;

  const musicId    = music.id || music.mid || null;
  const musicTitle = music.title || null;
  const musicAuth  = music.author || music.authorName || null;
  const musicUrl   = music.play_url?.url_list?.[0] || music.playUrl || null;
  const musicCover = music.cover_large?.url_list?.[0] || music.coverLarge || null;

  const cover    = video.cover?.url_list?.[0]         || video.cover        || null;
  const origCov  = video.origin_cover?.url_list?.[0]  || video.originCover  || null;
  const dynCov   = video.dynamic_cover?.url_list?.[0] || video.dynamicCover || null;

  return {
    id:            item.aweme_id || item.id || null,
    desc:          item.desc || item.description || '',
    createTime:    item.create_time || item.createTime || null,
    createTimeISO: (item.create_time || item.createTime)
      ? new Date(Number(item.create_time || item.createTime) * 1000).toISOString()
      : null,
    author: { id: uid, uniqueId, nickname, avatarThumb: avatar, avatarMedium: avatarM, signature: author.signature || null, verified: !!(author.custom_verify || author.verified) },
    stats:  { diggCount: digg, shareCount: share, commentCount: comment, playCount: play, collectCount: collect },
    music:  { id: musicId, title: musicTitle, authorName: musicAuth, duration: music.duration || null, playUrl: musicUrl, coverLarge: musicCover, original: !!(music.original) },
    video:  videoUrls.length ? { url: bestUrl, _urls: videoUrls, quality: videoQuality, width: video.width || null, height: video.height || null, duration: video.duration || null, ratio: video.ratio || null } : null,
    images: images.length ? images : null,
    covers: { cover, originCover: origCov, dynamicCover: dynCov },
    isAd:        !!(item.is_ads || item.isAd),
    isSlideshow: !!(imagePost),
    locationCreated: item.region || item.locationCreated || null,
  };
}

async function scrapeTikTok(inputUrl, client) {
  if (!inputUrl?.includes('tiktok')) throw new Error('URL TikTok tidak valid');

  if (!client) client = createClient();

  let url = inputUrl.trim();
  if (/vt\.|vm\.|\/\/t\.tiktok/.test(url)) {
    url = await resolveUrl(client, url);
  }

  const videoId = extractVideoId(url);
  if (!videoId) throw new Error('Tidak bisa ekstrak video ID dari URL: ' + url);
  log(`🎬 Video ID: ${videoId}`);

  let item = null;

  try {
    item = await fetchViaMobileApi(client, videoId);
  } catch (e) {
    log(`⚠️  Mobile API gagal: ${e.message}`);
  }

  if (!item) {
    try {
      item = await fetchViaWebApi(client, videoId);
    } catch (e) {
      log(`⚠️  Web API gagal: ${e.message}`);
      throw new Error('Semua metode gagal. ' + e.message);
    }
  }

  const result = normalize(item);
  result.originalUrl = url;
  result.scrapedAt   = new Date().toISOString();
  return { data: result, client }; // return client supaya bisa reuse buat download
}

async function streamToFile(client, url, dest, progress = "") {
    const response = await client.get(url, {
        responseType: "stream",
        headers: {
            Referer: "https://www.tiktok.com/",
            "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36"
        }
    });

    if (response.status !== 200) {
        throw new Error(`HTTP ${response.status}`);
    }

    return new Promise((resolve, reject) => {
        const writer = fs.createWriteStream(dest);
        let bytes = 0;
        let finished = false;

        const cleanup = () => {
            response.data.removeListener("data", onData);
            response.data.removeListener("error", onError);
            writer.removeListener("error", onError);
            writer.removeListener("finish", onFinish);
        };

        const onData = chunk => {
            bytes += chunk.length;
        };

        const onError = error => {
            if (finished) return;
            finished = true;
            cleanup();

            try {
                writer.destroy();
            } catch {}

            reject(error);
        };

        const onFinish = () => {
            if (finished) return;
            finished = true;
            cleanup();
            resolve(bytes);
        };

        response.data.on("data", onData);
        response.data.on("error", onError);
        writer.on("error", onError);
        writer.on("finish", onFinish);

        response.data.pipe(writer);
    });
}

async function downloadVideo(urls, outputPath, client) {
  const sorted = [...urls].sort((a, b) => {
    const getBt = (u) => { const m = u.match(/[&?]bt=(\d+)/); return m ? parseInt(m[1], 10) : 0; };
    const cdnA = a.includes('tiktokcdn.com') ? 10000 : 0;
    const cdnB = b.includes('tiktokcdn.com') ? 10000 : 0;
    return (getBt(b) + cdnB) - (getBt(a) + cdnA);
  });

  let lastErr = null;

  for (const url of sorted) {
    const bt = url.match(/[&?]bt=(\d+)/)?.[1];
    const host = new URL(url).hostname;
    log(`⏳ Mencoba download dari ${host} (bt=${bt ?? '?'})...`);
    try {
      const bytes = await streamToFile(client, url, outputPath, path.basename(outputPath));
      const sizeMB = (bytes / 1024 / 1024).toFixed(2);
      process.stderr.write(`✅ ${outputPath} (${sizeMB} MB)\n`);
      return outputPath;
    } catch (e) {
      log(`⚠️  Gagal: ${e.message}`);
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
      lastErr = e;
    }
  }

  throw lastErr ?? new Error('Semua URL download gagal');
}

async function downloadSlideshow(images, outputDir, videoId, client) {
    fs.mkdirSync(outputDir, {
        recursive: true
    });

    process.stderr.write(
        `📸 Slideshow: ${images.length} gambar → ${outputDir}/\n`
    );

    const results = [];

    for (let i = 0; i < images.length; i++) {
        const img = images[i];
        const num = String(i + 1).padStart(3, "0");

        const ext =
            img.url
                .match(/\.(jpe?g|png|webp|heic)(?:\?|$)/i)?.[1]
                ?.toLowerCase() || "jpg";

        const rawPath = path.join(
            outputDir,
            `${num}.${ext}`
        );

        const finalPath =
            ext === "heic"
                ? path.join(outputDir, `${num}.jpg`)
                : rawPath;

        try {
            const bytes = await streamToFile(
                client,
                img.url,
                rawPath,
                `${i + 1}/${images.length}`
            );

            if (!fs.existsSync(rawPath)) {
                throw new Error("File hasil download tidak ditemukan");
            }

            const stat = fs.statSync(rawPath);

            if (stat.size === 0) {
                throw new Error("File hasil download kosong");
            }

            if (ext === "heic") {
                const input = fs.readFileSync(rawPath);

                await sharp(input, {
                    sequentialRead: true
                })
                    .jpeg({
                        quality: 95
                    })
                    .toFile(finalPath);

                fs.unlinkSync(rawPath);
            }

            process.stderr.write(
                `✅ ${path.basename(finalPath)} (${(bytes / 1024).toFixed(0)} KB)\n`
            );

            results.push({
                index: i + 1,
                path: finalPath,
                url: img.url
            });

        } catch (e) {
            process.stderr.write(
                `⚠️ Gambar ${i + 1} gagal: ${e.message}\n`
            );

            for (const file of [rawPath, finalPath]) {
                if (fs.existsSync(file)) {
                    try {
                        fs.unlinkSync(file);
                    } catch {}
                }
            }

            results.push({
                index: i + 1,
                path: null,
                url: img.url,
                error: e.message
            });
        }
    }

    return results;
}

export default { scrapeTikTok, downloadVideo, downloadSlideshow };