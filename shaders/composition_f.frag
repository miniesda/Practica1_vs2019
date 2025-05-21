#version 460

#extension GL_EXT_ray_query : enable
#extension GL_ARB_shader_draw_parameters : enable
#define INV_PI 0.31830988618
#define PI   3.14159265358979323846264338327950288

//---------------------------------------------------------------------------------------------------------------------------
//True for shade map, false for RTX
bool shadeOrRTX = false;

#define ShadowBias 0.00015

#define PCF_SIZE 9
#define PCF_SAMPLES (PCF_SIZE * PCF_SIZE)
#define FILTER_SIZE (1.0 / 2048.0)

#define num_samples 16

//---------------------------------------------------------------------------------------------------------------------------

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
layout ( set = 0, binding = 7 ) uniform accelerationStructureEXT TLAS;

layout(location = 0) out vec4 out_color;

float evalVisibilityShadowMap(vec3 frag_pos, uint lightEval, vec3 normal, vec3 l){   
    float dynamicBias = max(0.0002 * (1 - dot(normal, l)), 0.0001);
    vec4 pos = per_frame_data.m_lights[lightEval].m_view_projection * vec4(frag_pos,1);
    pos.xyz/=pos.w;
    pos.xy = pos.xy*0.5+0.5;

    //Early exit outside map
    if (pos.x > 1.0 || pos.x < 0.0 || pos.y > 1.0 || pos.y < 0.0 || pos.z > 1.0 || pos.z < 0.0)
        return 1;

    // PCF filtering
    float visibility = 0.0;
    float currentDepth = pos.z;

    float depth = texture(i_shadow, vec3(pos.xy,lightEval)).r;

    for(int x = -PCF_SIZE/2; x <= PCF_SIZE/2; ++x){
        for(int y = -PCF_SIZE/2; y <= PCF_SIZE/2; ++y){
            // Sample shadow map with offset
            float closestDepth = texture(i_shadow, vec3(pos.xy + vec2(x, y) * FILTER_SIZE, lightEval)).r;
            // Apply bias and test visibility
            visibility += currentDepth - dynamicBias > closestDepth ? 0.0 : 1.0; //Change ShadowBias to bias
        }
    }

    // Average the samples
    return visibility / PCF_SAMPLES;
}

float rand(vec2 co) { //PseudoRandom generator
    return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
}

float PhiGen(int id, float offset)
{
    float idNew = id + offset;
    if (idNew > num_samples)
        idNew -= num_samples;
    return (idNew * (2.0 * PI)) / num_samples;
}

vec3 sampleInCone(vec3 center, float randScale, int i)
{
    float coneAngle = PI/360.0;
    float cosAlpha = cos(coneAngle);
    float sinAlpha = sin(coneAngle);
    
    // Add some randomization to the sampling
    float phi = PhiGen(i, randScale * num_samples);
    
    // Generate sample direction in local space
    vec3 dir = vec3(sinAlpha * cos(phi), sinAlpha * sin(phi), cosAlpha);
    
    // Create orthonormal basis around the center direction
    vec3 T, B;
    if(abs(center.z) < 0.999)
        T = normalize(cross(vec3(0.0, 0.0, 1.0), center));
    else
        T = normalize(cross(vec3(1.0, 0.0, 0.0), center));
    B = cross(center, T);
    
    // Transform the sample direction to world space
    return normalize(dir.x * T + dir.y * B + dir.z * center);
}

float evalVisibilityRayTraced(vec3 origin, vec3 L, float MaxDistance)
{
    
    float visibility = 0.0;

    rayQueryEXT rayQuery;
    rayQueryInitializeEXT(rayQuery, 
    TLAS, 
    gl_RayFlagsNoneEXT,
    0xFF,               //mask
    origin,             //pos ini ray
    1e-5,               //minimum distance
    L,             //direction ray
    MaxDistance);       //max distance

    rayQueryProceedEXT(rayQuery);

    // Check if there was a hit
    if (rayQueryGetIntersectionTypeEXT(rayQuery, true) == gl_RayQueryCommittedIntersectionNoneEXT)
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
                if (shadeOrRTX)
                shading += max( dot( n, l ), 0.0 ) * albedo.rgb * evalVisibilityShadowMap(frag_pos, id_light, n, l) * light.m_radiance.rgb;           //Shadow Mapping
                else
                shading += max( dot( n, l ), 0.0 ) * albedo.rgb * evalVisibilityRayTraced(frag_pos, l, 1000000) * light.m_radiance.rgb;                 //RTX
                break;
            }
            case 1: //point
            {
                vec3 l = light.m_light_pos.xyz - frag_pos;
                float dist = length( l );
                float att = 1.0 / (light.m_attenuattion.x + light.m_attenuattion.y * dist + light.m_attenuattion.z * dist * dist);
                vec3 radiance = light.m_radiance.rgb * att;
                l = normalize( l );

                if(shadeOrRTX)
                shading += max( dot( n, l ), 0.0 ) * albedo.rgb * radiance * evalVisibilityShadowMap(frag_pos, id_light, n, l);                       //Shadow Mapping
                else
                shading += max( dot( n, l ), 0.0 ) * albedo.rgb * evalVisibilityRayTraced(frag_pos, l, dist) * light.m_radiance.rgb;                    //RTX
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
  //return spec + diff * ((1- F) * (1 - metal));
  //return vec3(dotNL, dotNL, dotNL);
}

vec3 evalMicrofac(float metal, float rough)
{
    float ambientOcclussion = texture(i_ssao, f_uvs).r;
    vec4  albedo       = texture( i_albedo  , f_uvs );
    vec3  n            = normalize( texture( i_normal, f_uvs ).rgb * 2.0 - 1.0 );    
    vec3  frag_pos     = texture( i_position_and_depth, f_uvs ).xyz;
    vec3  shading = vec3( 0.0 );
    vec3 v = per_frame_data.m_camera_pos.xyz - frag_pos;
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
                if(shadeOrRTX)
                shading += max( dot( n, l ), 0.0 ) * brdf(l, v, n, albedo.rgb, rough, metal, F0) * evalVisibilityShadowMap(frag_pos, id_light, n, l) * light.m_radiance.rgb;      //Shadow Mapping
                else
                shading += max( dot( n, l ), 0.0 ) * brdf(l, v, n, albedo.rgb, rough, metal, F0) * evalVisibilityRayTraced(frag_pos, l, 1000000) * light.m_radiance.rgb;            //RTX
                break;
            }
            case 1: //point
            {
                vec3 l = light.m_light_pos.xyz - frag_pos;
                float dist = length( l );
                float att = 1.0 / (light.m_attenuattion.x + light.m_attenuattion.y * dist + light.m_attenuattion.z * dist * dist );
                vec3 radiance = light.m_radiance.rgb * att;
                l = normalize( l );
                
                if(shadeOrRTX)
                shading += max( dot( n, l ), 0.0 ) * brdf(l, v, n, albedo.rgb, rough, metal, F0) * radiance * evalVisibilityShadowMap(frag_pos, id_light, n, l);                  //Shadow Mapping
                else
                shading += max( dot( n, l ), 0.0 ) * brdf(l, v, n, albedo.rgb, rough, metal, F0) * radiance * evalVisibilityRayTraced(frag_pos, l, dist);                           //RTX
                break;
                //shading += light.m_light_pos.xyz;
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