// Upgraded mathematically-complete FMM Telea Inpainter Worker Code
// Implements priority heap queue and Eikonal distance solver (derived from scikit-image)

export const INLINE_WORKER_CODE = `
// Binary Heap Priority Queue
function HeapQueue(cmp) {
  this.cmp = cmp || function(a, b) { return a - b; };
  this.length = 0;
  this.data = [];
}
HeapQueue.prototype.peek = function() {
  return this.data[0];
};
HeapQueue.prototype.push = function(value) {
  this.data.push(value);
  var pos = this.data.length - 1, parent, x;
  while (pos > 0) {
    parent = (pos - 1) >>> 1;
    if (this.cmp(this.data[pos], this.data[parent]) < 0) {
      x = this.data[parent];
      this.data[parent] = this.data[pos];
      this.data[pos] = x;
      pos = parent;
    } else break;
  }
  return ++this.length;
};
HeapQueue.prototype.pop = function() {
  var ret = this.data[0], last_val = this.data.pop();
  this.length--;
  if (this.data.length > 0) {
    this.data[0] = last_val;
    var pos = 0, last = this.data.length - 1, left, right, minIndex, x;
    while (1) {
      left = (pos << 1) + 1;
      right = left + 1;
      minIndex = pos;
      if (left <= last && this.cmp(this.data[left], this.data[minIndex]) < 0) minIndex = left;
      if (right <= last && this.cmp(this.data[right], this.data[minIndex]) < 0) minIndex = right;
      if (minIndex !== pos) {
        x = this.data[minIndex];
        this.data[minIndex] = this.data[pos];
        this.data[pos] = x;
        pos = minIndex;
      } else break;
    }
  }
  return ret;
};

// Fast Marching Method Telea Inpainter
function inpaintTelea(width, height, image, mask, radius) {
  if (!radius) radius = 5;

  var LARGE_VALUE = 1e6;
  var SMALL_VALUE = 1e-6;

  var size = width * height;
  var flag = new Uint8Array(size);
  var u = new Float32Array(size);
  
  for (var i = 0; i < size; i++) {
    if (!mask[i]) continue;
    // Morphological dilation 1-pixel cross structuring
    flag[i + 1] = flag[i] = flag[i - 1] = flag[i + width] = flag[i - width] = 1;
  }
  
  for (var i = 0; i < size; i++) {
    flag[i] = (flag[i] * 2) - (mask[i] ^ flag[i]);
    if (flag[i] == 2) { // UNKNOWN
      u[i] = LARGE_VALUE;
    }
  }

  var heap = new HeapQueue(function(a, b) { return a[0] - b[0]; });
  
  for (var i = 0; i < size; i++) {
    if (flag[i] == 1) { // BAND
      heap.push([u[i], i]);
    }
  }
  
  var indices_centered = [];
  for (var i = -radius; i <= radius; i++) {
    var h = Math.floor(Math.sqrt(radius * radius - i * i));
    for (var j = -h; j <= h; j++) {
      indices_centered.push(i + j * width);
    }
  }

  function eikonal(n1, n2) {
    var u_out = LARGE_VALUE,
      u1 = u[n1],
      u2 = u[n2];
    if (flag[n1] == 0) {
      if (flag[n2] == 0) {
        var perp = Math.sqrt(2 - (u1 - u2) * (u1 - u2));
        var s = (u1 + u2 - perp) * 0.5;
        if (s >= u1 && s >= u2) {
          u_out = s;
        } else {
          s += perp;
          if (s >= u1 && s >= u2) {
            u_out = s;
          }
        }
      } else {
        u_out = 1 + u1;
      }
    } else if (flag[n2] == 0) {
      u_out = 1 + u2;
    }
    return u_out;
  }

  function grad_func(array, n, step) {
    if (flag[n + step] != 2) {
      if (flag[n - step] != 2) {
        return (array[n + step] - array[n - step]) * 0.5;
      } else {
        return array[n + step] - array[n];
      }
    } else {
      if (flag[n - step] != 2) {
        return array[n] - array[n - step];
      } else {
        return 0;
      }
    }
  }

  function inpaint_point(n) {
    var Ia = 0, norm = 0;
    var gradx_u = grad_func(u, n, 1),
      grady_u = grad_func(u, n, width); 
    
    var i = n % width,
      j = Math.floor(n / width);

    for (var k = 0; k < indices_centered.length; k++) {
      var nb = n + indices_centered[k];
      var i_nb = nb % width,
        j_nb = Math.floor(nb / width);

      if (i_nb <= 1 || j_nb <= 1 || i_nb >= width - 1 || j_nb >= height - 1) continue;
      if (flag[nb] != 0) continue; 

      var rx = i - i_nb,
        ry = j - j_nb;

      var geometric_dst = 1 / ((rx * rx + ry * ry) * Math.sqrt(rx * rx + ry * ry));
      var levelset_dst = 1 / (1 + Math.abs(u[nb] - u[n]));
      var direction = Math.abs(rx * gradx_u + ry * grady_u);
      var weight = geometric_dst * levelset_dst * direction + SMALL_VALUE;
      
      Ia += weight * image[nb];
      norm += weight;
    }
    image[n] = Ia / norm;
  }

  while (heap.length) {
    var n = heap.pop()[1];
    var i = n % width,
      j = Math.floor(n / width);
    flag[n] = 0; // KNOWN
    if (i <= 1 || j <= 1 || i >= width - 1 || j >= height - 1) continue;
    for (var k = 0; k < 4; k++) {
      var nb = n + [-width, -1, width, 1][k];
      if (flag[nb] != 0) { // not KNOWN
        u[nb] = Math.min(eikonal(nb - width, nb - 1),
                         eikonal(nb + width, nb - 1),
                         eikonal(nb - width, nb + 1),
                         eikonal(nb + width, nb + 1));
        if (flag[nb] == 2) { // UNKNOWN
          flag[nb] = 1; // BAND
          heap.push([u[nb], nb]);
          inpaint_point(nb);
        }
      }
    }
  }
  return image;
}

self.onmessage = function(e) {
  const { action, width, height, pixels, mask, radius } = e.data;

  if (action === 'inpaint') {
    // Process Telea inpainting on each color channel independently (R, G, B)
    const len = width * height;
    const output = new Uint8ClampedArray(pixels);

    for (let channel = 0; channel < 3; channel++) {
      const channelData = new Uint8Array(len);
      for (let n = 0; n < len; n++) {
        channelData[n] = pixels[n * 4 + channel];
      }

      inpaintTelea(width, height, channelData, mask, radius || 6);

      for (let n = 0; n < len; n++) {
        output[n * 4 + channel] = channelData[n];
        if (channel === 0) output[n * 4 + 3] = 255; // Solid Opacity
      }
    }

    self.postMessage({
      action: 'inpaint_result',
      pixels: output
    }, [output.buffer]);
  }
};
`;
