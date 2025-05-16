#version 460

#extension GL_ARB_shader_draw_parameters : enable
#define INV_PI 0.31830988618
#define PI   3.14159265358979323846264338327950288

layout( location = 0 ) in vec2 f_uvs;

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

layout ( set = 0, binding = 1 ) uniform sampler2D i_albedo;
layout ( set = 0, binding = 2 ) uniform sampler2D i_position_and_depth;
layout ( set = 0, binding = 3 ) uniform sampler2D i_normal;
layout ( set = 0, binding = 4 ) uniform sampler2D i_material;
layout ( set = 0, binding = 5 ) uniform sampler2D i_ssao;
layout ( set = 0, binding = 6 ) uniform sampler2DArray i_shadow;

layout(location = 0) out vec4 out_color;


#define ShadowBias 0.0001

float evalVisibility(vec3 frag_pos, uint lightEval)
{   
    vec4 pos = per_frame_data.m_lights[lightEval].m_view_projection * per_frame_data.m_inv_view * vec4(frag_pos,1);

    pos.xyz/=pos.w;

    pos.xy = pos.xy*0.5+0.5;

    float depth = texture(i_shadow,vec3(pos.xy,lightEval)).r + ShadowBias;

    if(depth > pos.z) //Change to smooth shadows //1 illum
        return 1;
    return 0;
}

vec3 evalDiffuse()
{
    float ambientOcclussion = texture(i_ssao, f_uvs).r;
    vec4  albedo       = texture( i_albedo  , f_uvs );
    vec3  n            = normalize( texture( i_normal, f_uvs ).rgb * 2.0 - 1.0 );    
    vec3  frag_pos     = texture( i_position_and_depth, f_uvs ).xyz;
    vec3  shading = vec3( 0.0 );


    for( uint id_light = 0; id_light < per_frame_data.m_number_of_lights; id_light++ )
    {
        LightData light = per_frame_data.m_lights[ id_light ];
        uint light_type = uint( floor( light.m_light_pos.a ) );

        switch( light_type )
        {
            case 0: //directional
            {
                vec3 l = normalize( -light.m_light_pos.xyz );
                shading += max( dot( n, l ), 0.0 ) * albedo.rgb * evalVisibility(frag_pos, id_light) * light.m_radiance.rgb;
                break;
            }
            case 1: //point
            {
                vec3 l = light.m_light_pos.xyz - frag_pos;
                float dist = length( l );
                float att = 1.0 / (light.m_attenuattion.x + light.m_attenuattion.y * dist + light.m_attenuattion.z * dist * dist);
                vec3 radiance = light.m_radiance.rgb * att;
                l = normalize( l );

                shading += max( dot( n, l ), 0.0 ) * albedo.rgb * radiance * evalVisibility(frag_pos, id_light);
                break;
            }
            case 2: //ambient
            {
                shading += light.m_radiance.rgb * albedo.rgb * ambientOcclussion;
                break;
            }
        }
    }

    return shading;
}


#define minimalTolerance 0.000000000000001


vec3 brdf(vec3 L, vec3 V, vec3 N, vec3 albedo, float rough, float metal, vec3 F0) {
  vec3 H = normalize(L + V);

  // --- Diffuse BRDF ---
  vec3 diff = albedo / PI;

  // --- Specular BRDF ---
  float dotNL = clamp(dot(N, L), 0, 1);
  float dotNV = clamp(dot(N, V), 0, 1);
  float dotNH = clamp(dot(N, H), 0, 1);
  float dotVH = clamp(dot(V, H), 0, 1);

  // Normal distribution (GGX / Trowbridge-Reitz)
  float a  = pow(rough, 2);
  float a2 = pow(a, 2);
  float D  = a2 / max(PI * pow(pow(dotNH, 2) * (a2 - 1) + 1, 2), minimalTolerance);

  // Fresnel (Schlick)
  vec3 F = F0 + (1 - F0) * pow(1 - dotVH, 5);

  // Geometry shadowing (Smith / Schlick GGX)
  float k  = pow(rough + 1, 2) / 8;
  float Gl = dotNL / max(dotNL * (1 - k) + k, minimalTolerance);  // Schlick GGX
  float Gv = dotNV / max(dotNV * (1 - k) + k, minimalTolerance);  // Schlick GGX
  float G  = Gl * Gv;  // Smith

  vec3 spec = vec3((D * F * G) / max(4 * dotNL * dotNV, minimalTolerance));


  return mix(diff * (1-metal), spec, F);
}

vec3 evalMicrofac(float metal, float rough)
{
    float ambientOcclussion = texture(i_ssao, f_uvs).r;
    vec4  albedo       = texture( i_albedo  , f_uvs );
    vec3  n            = normalize( texture( i_normal, f_uvs ).rgb * 2.0 - 1.0 );    
    vec3  frag_pos     = texture( i_position_and_depth, f_uvs ).xyz;
    vec3  shading = vec3( 0.0 );
    vec3 v = - frag_pos;
    v = normalize(v);
    vec3 F0 = mix(vec3(0.04), albedo.rgb, metal);


    for( uint id_light = 0; id_light < per_frame_data.m_number_of_lights; id_light++ )
    {
        LightData light = per_frame_data.m_lights[ id_light ];
        uint light_type = uint( floor( light.m_light_pos.a ) );

        switch( light_type )
        {
            case 0: //directional
            {
                vec3 l = normalize( -light.m_light_pos.xyz );
                
                shading += max( dot( n, l ), 0.0 ) * brdf(l, v, n, albedo.rgb, rough, metal, F0) * evalVisibility(frag_pos, id_light) * light.m_radiance.rgb;
                break;
            }
            case 1: //point
            {
                vec3 l = light.m_light_pos.xyz - frag_pos;
                float dist = length( l );
                float att = 1.0 / (light.m_attenuattion.x + light.m_attenuattion.y * dist + light.m_attenuattion.z * dist * dist );
                vec3 radiance = light.m_radiance.rgb * att;
                l = normalize( l );

                shading += max( dot( n, l ), 0.0 ) * brdf(l, v, n, albedo.rgb, rough, metal, F0) * radiance * evalVisibility(frag_pos, id_light);
                break;
            }
            case 2: //ambient
            {
                shading += light.m_radiance.rgb * albedo.rgb / PI * ambientOcclussion;
                break;
            }
        }
    }

    return shading;
}


void main() 
{
    float gamma = 2.2f;
    float exposure = 1.0f;

    vec4 material = texture ( i_material, f_uvs);

    vec3 color;

    if (material.z < 0.5)
    color = evalDiffuse();
    else
    color = evalMicrofac(material.x, material.y); //metal & rough


    vec3 mapped = vec3( 1.0f ) - exp(-color * exposure);

    out_color = vec4( pow( mapped, vec3( 1.0f / gamma ) ), 1.0 );
}