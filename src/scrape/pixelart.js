import sharp from 'sharp'
import { spawn } from 'node:child_process'

function clamp(value, min = 0, max = 255) {
  return Math.max(
    min,
    Math.min(max, value)
  )
}

/*
 * Pixelate image menggunakan resize kecil
 * lalu nearest-neighbor.
 *
 * size:
 * 1  = hampir normal
 * 5  = ringan
 * 10 = sedang
 * 17 = kuat
 */
async function pixelateBuffer(
  buffer,
  size = 10
) {
  if (!Buffer.isBuffer(buffer)) {
    throw new TypeError(
      'buffer harus berupa Buffer'
    )
  }

  size = Number(size)

  if (!Number.isFinite(size) || size <= 0) {
    throw new TypeError(
      'size harus berupa angka > 0'
    )
  }

  const metadata =
    await sharp(buffer).metadata()

  const width = metadata.width
  const height = metadata.height

  if (!width || !height) {
    throw new Error(
      'Tidak bisa membaca ukuran gambar'
    )
  }

  /*
   * Alight Motion style:
   * size bukan berarti jumlah blok.
   *
   * Kita jadikan size sebagai ukuran
   * pixel relatif terhadap resolusi.
   */
  const pixelSize =
    Math.max(
      1,
      Math.round(size)
    )

  const smallWidth =
    Math.max(
      1,
      Math.round(width / pixelSize)
    )

  const smallHeight =
    Math.max(
      1,
      Math.round(height / pixelSize)
    )

  const small =
    await sharp(buffer)
      .resize(
        smallWidth,
        smallHeight,
        {
          kernel: sharp.kernel.nearest
        }
      )
      .resize(
        width,
        height,
        {
          kernel: sharp.kernel.nearest
        }
      )
      .ensureAlpha()
      .raw()
      .toBuffer({
        resolveWithObject: true
      })

  return {
    data: small.data,
    width,
    height
  }
}

/*
 * Saturation.
 *
 * saturation = 100
 * berarti normal.
 *
 * saturation = 0
 * berarti grayscale.
 *
 * saturation = 150
 * berarti lebih kuat.
 */
function applySaturation(
  data,
  saturation
) {
  const amount =
    Number(saturation) / 100

  for (
    let i = 0;
    i < data.length;
    i += 4
  ) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]

    const gray =
      0.299 * r +
      0.587 * g +
      0.114 * b

    data[i] =
      clamp(
        gray +
        (r - gray) * amount
      )

    data[i + 1] =
      clamp(
        gray +
        (g - gray) * amount
      )

    data[i + 2] =
      clamp(
        gray +
        (b - gray) * amount
      )
  }
}

/*
 * Alpha.
 *
 * 100 = normal
 * 50  = setengah transparan
 * 0   = transparan
 */
function applyAlpha(
  data,
  alpha
) {
  const amount =
    Math.max(
      0,
      Math.min(
        100,
        Number(alpha)
      )
    ) / 100

  for (
    let i = 3;
    i < data.length;
    i += 4
  ) {
    data[i] =
      clamp(
        data[i] * amount
      )
  }
}

/*
 * Vignette.
 *
 * 0  = tidak ada vignette
 * 70 = kuat
 * 100 = sangat kuat
 */
function applyVignette(
  data,
  width,
  height,
  vignette
) {
  const strength =
    Math.max(
      0,
      Math.min(
        100,
        Number(vignette)
      )
    ) / 100

  if (strength <= 0) {
    return
  }

  const cx =
    (width - 1) / 2

  const cy =
    (height - 1) / 2

  const maxDistance =
    Math.sqrt(
      cx * cx +
      cy * cy
    )

  for (
    let y = 0;
    y < height;
    y++
  ) {
    for (
      let x = 0;
      x < width;
      x++
    ) {
      const dx =
        (x - cx) / maxDistance

      const dy =
        (y - cy) / maxDistance

      const distance =
        Math.sqrt(
          dx * dx +
          dy * dy
        )

      /*
       * Smooth vignette.
       */
      const normalized =
        Math.min(
          1,
          distance
        )

      const falloff =
        normalized *
        normalized

      const factor =
        1 -
        (
          falloff *
          strength *
          0.85
        )

      const index =
        (
          y * width +
          x
        ) * 4

      data[index] =
        clamp(
          data[index] *
          factor
        )

      data[index + 1] =
        clamp(
          data[index + 1] *
          factor
        )

      data[index + 2] =
        clamp(
          data[index + 2] *
          factor
        )
    }
  }
}

/*
 * Main image processor.
 */
async function pixelArtFromBuffer(
  buffer,
  options = {}
) {
  const {
    size = 10,
    vignette = 70,
    saturation = 100,
    alpha = 100
  } = options

  const result =
    await pixelateBuffer(
      buffer,
      size
    )

  const data =
    result.data

  /*
   * Saturation.
   */
  if (
    Number.isFinite(
      Number(saturation)
    )
  ) {
    applySaturation(
      data,
      saturation
    )
  }

  /*
   * Vignette.
   */
  if (
    Number(vignette) > 0
  ) {
    applyVignette(
      data,
      result.width,
      result.height,
      vignette
    )
  }

  /*
   * Alpha.
   */
  if (
    Number(alpha) < 100
  ) {
    applyAlpha(
      data,
      alpha
    )
  }

  return await sharp(
    data,
    {
      raw: {
        width: result.width,
        height: result.height,
        channels: 4
      }
    }
  )
    .png()
    .toBuffer()
}

/*
 * JPEG.
 */
async function pixelArtToJpeg(
  buffer,
  options = {},
  quality = 90
) {
  const result =
    await pixelArtFromBuffer(
      buffer,
      options
    )

  return await sharp(result)
    .jpeg({
      quality
    })
    .toBuffer()
}

/*
 * WebP.
 */
async function pixelArtToWebp(
  buffer,
  options = {},
  quality = 90
) {
  const result =
    await pixelArtFromBuffer(
      buffer,
      options
    )

  return await sharp(result)
    .webp({
      quality
    })
    .toBuffer()
}

/*
 * FFmpeg helper.
 */
function runFFmpeg(
  args,
  input
) {
  return new Promise(
    (resolve, reject) => {
      const process =
        spawn(
          'ffmpeg',
          [
            '-hide_banner',
            '-loglevel',
            'error',
            ...args
          ]
        )

      const output = []
      const errors = []

      process.stdout.on(
        'data',
        chunk => {
          output.push(chunk)
        }
      )

      process.stderr.on(
        'data',
        chunk => {
          errors.push(chunk)
        }
      )

      process.on(
        'error',
        reject
      )

      process.stdin.on(
        'error',
        () => {}
      )

      process.on(
        'close',
        code => {
          if (code !== 0) {
            return reject(
              new Error(
                Buffer
                  .concat(errors)
                  .toString() ||
                `FFmpeg exited with code ${code}`
              )
            )
          }

          resolve(
            Buffer.concat(output)
          )
        }
      )

      process.stdin.end(input)
    }
  )
}

/*
 * Video pixelate.
 *
 * Parameter:
 *
 * size
 *   10 = pixelate sedang
 *   17 = pixelate lebih kuat
 *
 * vignette
 *   70 = vignette kuat
 *
 * saturation
 *   100 = normal
 *
 * alpha
 *   100 = normal
 *
 * fps
 *   30 = smooth
 *   12 = stylized
 *   8  = retro
 *   6  = sangat patah
 */
async function pixelArtVideoFromBuffer(
  buffer,
  options = {}
) {
  if (!Buffer.isBuffer(buffer)) {
    throw new TypeError(
      'buffer harus berupa Buffer'
    )
  }

  const {
    size = 10,
    vignette = 70,
    saturation = 100,
    alpha = 100,
    fps = 30
  } = options

  if (
    !Number.isFinite(
      Number(size)
    ) ||
    Number(size) <= 0
  ) {
    throw new TypeError(
      'size harus berupa angka > 0'
    )
  }

  if (
    !Number.isFinite(
      Number(fps)
    ) ||
    Number(fps) <= 0
  ) {
    throw new TypeError(
      'fps harus berupa angka > 0'
    )
  }

  const filters = []

  /*
   * PIXELATE
   *
   * Contoh size 10:
   *
   * 1920x1080
   * ↓
   * 192x108
   * ↓
   * 1920x1080
   *
   * nearest membuat pixel tetap tajam.
   */
  const pixelSize =
    Math.max(
      1,
      Math.round(
        Number(size)
      )
    )

  filters.push(
    `scale=` +
    `trunc(iw/${pixelSize}):` +
    `trunc(ih/${pixelSize}):` +
    `flags=neighbor`
  )

  filters.push(
    `scale=` +
    `trunc(iw*${pixelSize}/2)*2:` +
    `trunc(ih*${pixelSize}/2)*2:` +
    `flags=neighbor`
  )

  /*
   * Saturation.
   *
   * 100 = normal.
   */
  const sat =
    Math.max(
      0,
      Number(saturation) / 100
    )

  filters.push(
    `eq=saturation=${sat.toFixed(4)}`
  )

  /*
   * Vignette.
   *
   * FFmpeg vignette:
   * angle kecil = lebih ringan
   * angle besar = lebih kuat
   */
  if (
    Number(vignette) > 0
  ) {
    const v =
      Math.max(
        0,
        Math.min(
          100,
          Number(vignette)
        )
      )

    /*
     * Konversi 0-100
     * menjadi strength yang cocok
     * untuk vignette FFmpeg.
     */
    const angle =
      (
        0.25 +
        (v / 100) * 0.75
      ).toFixed(3)

    filters.push(
      `vignette=angle=${angle}`
    )
  }

  /*
   * Alpha < 100.
   */
  if (
    Number(alpha) < 100
  ) {
    const a =
      Math.max(
        0,
        Math.min(
          1,
          Number(alpha) / 100
        )
      )

    filters.push(
      `format=rgba`
    )

    filters.push(
      `colorchannelmixer=aa=${a.toFixed(4)}`
    )
  }

  /*
   * Pastikan ukuran akhir GENAP.
   *
   * Ini memperbaiki:
   *
   * width not divisible by 2
   *
   * seperti 511x287.
   */
  filters.push(
    `scale=` +
    `trunc(iw/2)*2:` +
    `trunc(ih/2)*2`
  )

  return await runFFmpeg(
    [
      '-i',
      'pipe:0',

      '-vf',
      filters.join(','),

      '-r',
      String(
        Math.round(
          Number(fps)
        )
      ),

      '-c:v',
      'libx264',

      '-preset',
      'veryfast',

      '-crf',
      '20',

      '-pix_fmt',
      'yuv420p',

      '-c:a',
      'aac',

      '-b:a',
      '128k',

      '-movflags',
      'frag_keyframe+empty_moov',

      '-f',
      'mp4',

      'pipe:1'
    ],
    buffer
  )
}

export {
  pixelArtFromBuffer,
  pixelArtToJpeg,
  pixelArtToWebp,
  pixelArtVideoFromBuffer
}