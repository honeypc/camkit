// GLSL ES 3.0 Vertex & Fragment shaders for advanced GPU image processing

export const VERTEX_SHADER = `#version 300 es
in vec2 position;
out vec2 v_texCoord;
void main() {
  v_texCoord = position * 0.5 + 0.5;
  // Flip Y-axis to match Canvas coordinate system
  gl_Position = vec4(position.x, position.y, 0.0, 1.0);
}
`;

export const FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 outColor;

uniform sampler2D u_image;

// Basic Adjustments
uniform float u_brightness;   // -1.0 to 1.0
uniform float u_contrast;     // -1.0 to 1.0
uniform float u_exposure;     // -1.0 to 1.0
uniform float u_saturation;   // -1.0 to 1.0
uniform float u_vibrance;     // -1.0 to 1.0

// Color Temp & Tint
uniform float u_temperature;  // -1.0 to 1.0
uniform float u_tint;         // -1.0 to 1.0

// Highlight / Shadow
uniform float u_highlights;   // -1.0 to 1.0
uniform float u_shadows;      // -1.0 to 1.0

// Vignette
uniform float u_vignette;     // 0.0 to 1.0

// Sharpening / Clarity
uniform float u_sharpening;   // 0.0 to 1.0
uniform float u_clarity;      // 0.0 to 1.0

// Helper: Convert RGB to Luminance
float getLuminance(vec3 color) {
  return dot(color, vec3(0.299, 0.587, 0.114));
}

// Helper: Apply Temperature / Tint
vec3 applyTempTint(vec3 color, float temp, float tint) {
  // Warming / Cooling shift vectors
  vec3 warm = vec3(0.2, 0.08, -0.2);
  vec3 cool = vec3(-0.2, -0.05, 0.2);
  vec3 tintShift = vec3(0.1, -0.2, 0.1); // Green vs Magenta

  color += (temp > 0.0 ? warm * temp : cool * -temp);
  color += tintShift * tint;
  return clamp(color, 0.0, 1.0);
}

// Helper: Highlight and Shadow recovery
vec3 applyHighlightsShadows(vec3 color, float hl, float sd) {
  float luma = getLuminance(color);

  // High-light weight (more pronounced on bright pixels)
  float hlWeight = pow(luma, 2.0);
  // Shadow weight (more pronounced on dark pixels)
  float sdWeight = pow(1.0 - luma, 2.0);

  // Apply shifts
  color += (hl > 0.0 ? vec3(hl * hlWeight) * 0.15 : vec3(hl * hlWeight) * 0.15);
  color += (sd > 0.0 ? vec3(sd * sdWeight) * 0.15 : vec3(sd * sdWeight) * 0.15);

  return clamp(color, 0.0, 1.0);
}

// Helper: Vibrance adjustment (selectively saturate unsaturated colors)
vec3 applyVibrance(vec3 color, float val) {
  float luma = getLuminance(color);
  float maxVal = max(color.r, max(color.g, color.b));
  float minVal = min(color.r, min(color.g, color.b));
  float sat = maxVal - minVal;

  // Selective scaling curve based on current saturation
  float factor = val * (1.0 - sat) * 1.5;
  color = mix(vec3(luma), color, 1.0 + factor);
  return clamp(color, 0.0, 1.0);
}

void main() {
  vec4 texel = texture(u_image, v_texCoord);
  vec3 rgb = texel.rgb;

  // 1. Exposure
  rgb *= pow(2.0, u_exposure);

  // 2. Brightness
  rgb += u_brightness * 0.5;

  // 3. Contrast
  rgb = (rgb - 0.5) * (u_contrast + 1.0) + 0.5;
  rgb = clamp(rgb, 0.0, 1.0);

  // 4. Temperature & Tint
  rgb = applyTempTint(rgb, u_temperature, u_tint);

  // 5. Highlights & Shadows
  rgb = applyHighlightsShadows(rgb, u_highlights, u_shadows);

  // 6. Saturation
  float luma = getLuminance(rgb);
  rgb = mix(vec3(luma), rgb, u_saturation + 1.0);

  // 7. Vibrance
  rgb = applyVibrance(rgb, u_vibrance);

  // 8. Vignette (Darkening corners radial math)
  if (u_vignette > 0.0) {
    float dist = distance(v_texCoord, vec2(0.5, 0.5));
    // Radial Vignette curve
    float percent = smoothstep(0.4, 0.9, dist);
    rgb = mix(rgb, rgb * (1.0 - u_vignette), percent);
  }

  outColor = vec4(rgb, texel.a);
}
`;

// Direct Convolution shader for Sharpening/Clarity
export const CONVOLUTION_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 outColor;

uniform sampler2D u_image;
uniform vec2 u_textureSize;
uniform float u_sharpen; // 0.0 to 1.0
uniform float u_clarity; // 0.0 to 1.0

void main() {
  vec2 onePixel = vec2(1.0) / u_textureSize;
  vec4 center = texture(u_image, v_texCoord);

  // Sharpening Laplacian Kernel (3x3)
  // [  0, -1,  0 ]
  // [ -1,  5, -1 ]
  // [  0, -1,  0 ]
  vec4 sum = vec4(0.0);
  sum += texture(u_image, v_texCoord + vec2(0.0, -onePixel.y)) * -1.0;
  sum += texture(u_image, v_texCoord + vec2(-onePixel.x, 0.0)) * -1.0;
  sum += texture(u_image, v_texCoord) * 5.0;
  sum += texture(u_image, v_texCoord + vec2(onePixel.x, 0.0)) * -1.0;
  sum += texture(u_image, v_texCoord + vec2(0.0, onePixel.y)) * -1.0;

  // Mix standard image and sharpened image based on intensity
  vec4 sharpenedColor = mix(center, sum, u_sharpen * 0.5);

  // Clarity High-Pass Filter (Simple Local Contrast Enhancement Approximation)
  // Contrast increase on midtones using large step
  vec4 blur = vec4(0.0);
  float samples = 0.0;
  for (int x = -2; x <= 2; x++) {
    for (int y = -2; y <= 2; y++) {
      blur += texture(u_image, v_texCoord + vec2(x, y) * onePixel * 2.0);
      samples += 1.0;
    }
  }
  blur /= samples;

  // Highpass local details
  vec4 highPass = center - blur;
  vec4 clarityColor = center + highPass * (u_clarity * 0.4);

  // Blend both sharpening and clarity effects
  outColor = mix(sharpenedColor, clarityColor, u_clarity > 0.0 ? 0.5 : 0.0);
  outColor.a = center.a;
}
`;

// Gaussian Blur Shader (Horizontal/Vertical pass)
export const GAUSSIAN_BLUR_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 outColor;

uniform sampler2D u_image;
uniform vec2 u_direction; // (1.0, 0.0) or (0.0, 1.0)
uniform float u_radius;    // Blur radius
uniform vec2 u_textureSize;

void main() {
  vec2 onePixel = vec2(1.0) / u_textureSize;
  vec4 colorSum = vec4(0.0);
  float weightSum = 0.0;

  float stepSize = max(1.0, u_radius / 5.0);

  for (float i = -u_radius; i <= u_radius; i += stepSize) {
    // Standard Gaussian weight formula
    float weight = exp(-(i * i) / (2.0 * u_radius * u_radius));
    vec2 offset = u_direction * i * onePixel;
    colorSum += texture(u_image, v_texCoord + offset) * weight;
    weightSum += weight;
  }

  outColor = colorSum / weightSum;
}
`;
