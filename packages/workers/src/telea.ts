// Mathematically rigorous Fast Marching Method (FMM) Telea Inpainter fallback in pure TypeScript

class HeapQueue<T> {
  private cmp: (a: T, b: T) => number;
  public length = 0;
  private data: T[] = [];

  constructor(cmp: (a: T, b: T) => number) {
    this.cmp = cmp;
  }

  public push(value: T): number {
    this.data.push(value);
    let pos = this.data.length - 1;
    while (pos > 0) {
      const parent = (pos - 1) >>> 1;
      if (this.cmp(this.data[pos], this.data[parent]) < 0) {
        const x = this.data[parent];
        this.data[parent] = this.data[pos];
        this.data[pos] = x;
        pos = parent;
      } else break;
    }
    return ++this.length;
  }

  public pop(): T {
    const ret = this.data[0];
    const lastVal = this.data.pop()!;
    this.length--;
    if (this.data.length > 0) {
      this.data[0] = lastVal;
      let pos = 0;
      const last = this.data.length - 1;
      while (true) {
        const left = (pos << 1) + 1;
        const right = left + 1;
        let minIndex = pos;
        if (left <= last && this.cmp(this.data[left], this.data[minIndex]) < 0) minIndex = left;
        if (right <= last && this.cmp(this.data[right], this.data[minIndex]) < 0) minIndex = right;
        if (minIndex !== pos) {
          const x = this.data[minIndex];
          this.data[minIndex] = this.data[pos];
          this.data[pos] = x;
          pos = minIndex;
        } else break;
      }
    }
    return ret;
  }
}

export function inpaintTelea(
  width: number,
  height: number,
  pixels: Uint8ClampedArray,
  mask: Uint8ClampedArray,
  radius = 5
): Uint8ClampedArray {
  const output = new Uint8ClampedArray(pixels);
  const size = width * height;

  // Run inpaint independently for each color channel (R, G, B)
  for (let channel = 0; channel < 3; channel++) {
    const channelData = new Uint8Array(size);
    for (let n = 0; n < size; n++) {
      channelData[n] = pixels[n * 4 + channel];
    }

    inpaintSingleChannel(width, height, channelData, mask, radius);

    for (let n = 0; n < size; n++) {
      output[n * 4 + channel] = channelData[n];
      if (channel === 0) output[n * 4 + 3] = 255; // Solid Opacity
    }
  }

  return output;
}

function inpaintSingleChannel(
  width: number,
  height: number,
  image: Uint8Array,
  mask: Uint8ClampedArray,
  radius: number
): Uint8Array {
  const LARGE_VALUE = 1e6;
  const SMALL_VALUE = 1e-6;

  const size = width * height;
  const flag = new Uint8Array(size);
  const u = new Float32Array(size);
  
  for (let i = 0; i < size; i++) {
    if (!mask[i]) continue;
    flag[i + 1] = flag[i] = flag[i - 1] = flag[i + width] = flag[i - width] = 1;
  }
  
  for (let i = 0; i < size; i++) {
    flag[i] = (flag[i] * 2) - (mask[i] ^ flag[i]);
    if (flag[i] === 2) {
      u[i] = LARGE_VALUE;
    }
  }

  const heap = new HeapQueue<[number, number]>((a, b) => a[0] - b[0]);
  
  for (let i = 0; i < size; i++) {
    if (flag[i] === 1) {
      heap.push([u[i], i]);
    }
  }
  
  const indicesCentered: number[] = [];
  for (let i = -radius; i <= radius; i++) {
    const h = Math.floor(Math.sqrt(radius * radius - i * i));
    for (let j = -h; j <= h; j++) {
      indicesCentered.push(i + j * width);
    }
  }

  function eikonal(n1: number, n2: number): number {
    let uOut = LARGE_VALUE;
    const u1 = u[n1];
    const u2 = u[n2];

    if (flag[n1] === 0) {
      if (flag[n2] === 0) {
        const perp = Math.sqrt(2 - (u1 - u2) * (u1 - u2));
        let s = (u1 + u2 - perp) * 0.5;
        if (s >= u1 && s >= u2) {
          uOut = s;
        } else {
          s += perp;
          if (s >= u1 && s >= u2) {
            uOut = s;
          }
        }
      } else {
        uOut = 1 + u1;
      }
    } else if (flag[n2] === 0) {
      uOut = 1 + u2;
    }
    return uOut;
  }

  function gradFunc(array: Float32Array | Uint8Array, n: number, step: number): number {
    if (flag[n + step] !== 2) {
      if (flag[n - step] !== 2) {
        return (array[n + step] - array[n - step]) * 0.5;
      } else {
        return array[n + step] - array[n];
      }
    } else {
      if (flag[n - step] !== 2) {
        return array[n] - array[n - step];
      } else {
        return 0;
      }
    }
  }

  function inpaintPoint(n: number) {
    let Ia = 0;
    let norm = 0;
    const gradx_u = gradFunc(u, n, 1);
    const grady_u = gradFunc(u, n, width); 
    
    const i = n % width;
    const j = Math.floor(n / width);

    for (let k = 0; k < indicesCentered.length; k++) {
      const nb = n + indicesCentered[k];
      const i_nb = nb % width;
      const j_nb = Math.floor(nb / width);

      if (i_nb <= 1 || j_nb <= 1 || i_nb >= width - 1 || j_nb >= height - 1) continue;
      if (flag[nb] !== 0) continue; 

      const rx = i - i_nb;
      const ry = j - j_nb;

      const geometricDst = 1 / ((rx * rx + ry * ry) * Math.sqrt(rx * rx + ry * ry));
      const levelsetDst = 1 / (1 + Math.abs(u[nb] - u[n]));
      const direction = Math.abs(rx * gradx_u + ry * grady_u);
      const weight = geometricDst * levelsetDst * direction + SMALL_VALUE;
      
      Ia += weight * image[nb];
      norm += weight;
    }
    image[n] = Ia / norm;
  }

  while (heap.length > 0) {
    const n = heap.pop()[1];
    const i = n % width;
    const j = Math.floor(n / width);
    flag[n] = 0; // KNOWN
    if (i <= 1 || j <= 1 || i >= width - 1 || j >= height - 1) continue;
    for (let k = 0; k < 4; k++) {
      const nb = n + [-width, -1, width, 1][k];
      if (flag[nb] !== 0) {
        u[nb] = Math.min(eikonal(nb - width, nb - 1),
                         eikonal(nb + width, nb - 1),
                         eikonal(nb - width, nb + 1),
                         eikonal(nb + width, nb + 1));
        if (flag[nb] === 2) {
          flag[nb] = 1; // BAND
          heap.push([u[nb], nb]);
          inpaintPoint(nb);
        }
      }
    }
  }
  return image;
}
