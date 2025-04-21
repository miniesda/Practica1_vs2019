#version 460

#extension GL_ARB_shader_draw_parameters : enable

layout(location = 0) in vec2 f_uvs;

layout (set = 0, binding = 0) uniform sampler2D i_input;

layout (location = 0) out vec4 out_color;

void main() {
  vec2 texelSize = 1.0 / vec2(textureSize(i_input, 0));
  vec4 result = vec4(0.0);
  for (int i = -2; i < 2; ++i) {
    for (int j = -2; j < 2; ++j) {
      vec2 off = vec2(float(j), float(i)) * texelSize;
      result += texture(i_input, f_uvs + off);
    }
  }
  result = result / (4.0 * 4.0);
  out_color = result;
}