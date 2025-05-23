#version 460

layout(triangles) in;
layout(triangle_strip, max_vertices = 30) out;

#extension GL_ARB_shader_draw_parameters : enable

layout( location = 0 ) in vec3 g_position[];
layout( location = 1 ) in vec3 g_normal[];
layout( location = 2 ) in vec2 g_uv[];
layout( location = 3 ) in flat int g_instance[];

//globals
struct LightData
{
    vec4 m_light_pos;
    vec4 m_radiance;
    vec4 m_attenuattion;
    mat4 m_view_projection;
};

layout( std140, set = 0, binding = 0 ) uniform PerFrameData
{
    vec4      m_camera_pos;
    mat4      m_view;
    mat4      m_projection;
    mat4      m_view_projection;
    mat4      m_inv_view;
    mat4      m_inv_projection;
    mat4      m_inv_view_projection;
    vec4      m_clipping_planes;
    LightData m_lights[ 10 ];
    uint      m_number_of_lights;
} per_frame_data;



void main() {
    for (int i = 0; i < per_frame_data.m_number_of_lights; ++i) {

       // TBD
       gl_Layer = i;
       for (int j = 0; j<3; j++){
           gl_Position = per_frame_data.m_lights[i].m_view_projection * vec4(g_position[j],1);
           EmitVertex();
       }
       EndPrimitive();
    }
}