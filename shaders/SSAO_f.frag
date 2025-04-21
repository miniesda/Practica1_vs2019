#version 460

#extension GL_ARB_shader_draw_parameters : enable

layout( location = 0 ) in vec2 f_uvs;

//globals
struct LightData
{
    vec4 m_light_pos;
    vec4 m_radiance;
    vec4 m_attenuattion;
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

layout ( set = 0, binding = 1 ) uniform sampler2D i_position_and_depth;
layout ( set = 0, binding = 2 ) uniform sampler2D i_normal;
layout ( set = 0, binding = 3 ) uniform sampler2D i_noise;

const float radius = 0.5;
const float bias = 0.025;

layout( std140, set = 0, binding = 4 ) uniform KernelData
{
    vec4      m_kernel_data[64];
} kernel_data;

layout(location = 0) out float out_color;


void main()
{
// get input for SSAO algorithm
    vec2 noiseScale = vec2(textureSize(i_position_and_depth, 0)) / vec2(textureSize(i_noise, 0));

    vec3 fragPos = texture(i_position_and_depth, f_uvs).xyz;
    vec3 normal = texture (i_normal, f_uvs).rgb * 2.0 - 1.0;
    vec3 randomVec = vec3(texture (i_noise, f_uvs* noiseScale).xy, 0); 
    
    // create TBN change-of-basis matrix: from tangent-space to view-space
    
    vec3 tangent = normalize(randomVec - normal * dot (randomVec, normal));
    vec3 bitangent = cross(normal, tangent);
    mat3 TBN = mat3 (tangent, bitangent, normal);

    // iterate over the sample kernel and calculate occlusion factor 
    float occlusion = 0.0;
    
    for (int i = 0; i < 64; ++i)
    {
        // get sample position
    
        vec3 samplePos = TBN * kernel_data.m_kernel_data[i].xyz; // from tangent to view-space
        samplePos = fragPos + samplePos * radius;

        // project sample position (to sample texture) (to get position on screen/texture)
        vec4 offset = vec4(samplePos,1.0);
        offset = per_frame_data.m_projection * offset; // from view to clip-space
        offset.xy /= offset.w; // perspective divide
        offset.xy = offset.xy * 0.5 + 0.5; // transform to range 0.0 1.0

        // get sample depth
        float sampleDepth = (per_frame_data.m_view * vec4( texture (i_position_and_depth, offset.xy).xyz, 1) ).z; // get depth value of kernel sample
    
        // range check & accumulate
        float rangeCheck = smoothstep(0.0, 1.0, radius / abs (fragPos.z - sampleDepth));
        occlusion += (sampleDepth >= samplePos.z + bias ? 1.0: 0.0)* rangeCheck;
    }
    out_color = 1.0 - (occlusion / 64.0);
}