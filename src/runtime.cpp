#include "runtime.h"
#include "vulkan/rendererVK.h"
#include "vulkan/deviceVK.h"
#include "vulkan/utilsVK.h"
#include "frame.h"

using namespace MiniEngine;


void Runtime::createResources()
{
    for( uint32_t id = 0; id < m_per_frame_buffer.size(); id++ )
    {
        if( VK_NULL_HANDLE == m_per_frame_buffer[ id ] )
        {
            UtilsVK::createBuffer( *m_renderer->getDevice(), sizeof( PerFrameData ), VK_BUFFER_USAGE_UNIFORM_BUFFER_BIT, VK_MEMORY_PROPERTY_HOST_VISIBLE_BIT | VK_MEMORY_PROPERTY_HOST_COHERENT_BIT, m_per_frame_buffer[ id ], m_per_frame_buffer_memory[ id ] );
        }

        if( VK_NULL_HANDLE == m_per_object_buffer[ id ] )
        {
            UtilsVK::createBuffer( *m_renderer->getDevice(), sizeof( PerObjectData ) * kMAX_NUMBER_OF_OBJECTS, VK_BUFFER_USAGE_STORAGE_BUFFER_BIT, VK_MEMORY_PROPERTY_HOST_VISIBLE_BIT | VK_MEMORY_PROPERTY_HOST_COHERENT_BIT, m_per_object_buffer[ id ], m_per_object_buffer_memory[ id ] );
        }
    }
    
    if (VK_NULL_HANDLE == m_ssao_buffer)
    {
        UtilsVK::createBuffer(*m_renderer->getDevice(), sizeof(SSAOData), VK_BUFFER_USAGE_UNIFORM_BUFFER_BIT, VK_MEMORY_PROPERTY_HOST_VISIBLE_BIT | VK_MEMORY_PROPERTY_HOST_COHERENT_BIT, m_ssao_buffer, m_ssao_buffer_memory);

        std::uniform_real_distribution<float> randomFloats(0.0, 1.0); // random floats between [0.0, 1.0]
        std::default_random_engine generator;

        std::array<Vector4f, 64> ssaoKernel;

        for (unsigned int i = 0; i < 64; ++i)
        {
            glm::vec4 sample(
                randomFloats(generator) * 2.0 - 1.0,
                randomFloats(generator) * 2.0 - 1.0,
                randomFloats(generator),
            0.0f);
            sample = glm::normalize(sample);
            sample *= randomFloats(generator);

            float scale = (float)i / 64.0;
            scale = glm::mix(0.1f, 1.0f, scale * scale);
            sample *= scale;

            ssaoKernel[i] = (sample);
        }

        void* data;
        vkMapMemory(m_renderer->getDevice()->getLogicalDevice(), m_ssao_buffer_memory, 0, sizeof(SSAOData), 0, &data);

        memcpy(data, ssaoKernel.data(), sizeof(SSAOData));

        vkUnmapMemory(m_renderer->getDevice()->getLogicalDevice(), m_ssao_buffer_memory);

    }
}


void Runtime::freeResources()
{
    for( uint32_t id = 0; id < m_per_frame_buffer.size(); id++ )
    {
        if( VK_NULL_HANDLE != m_per_frame_buffer[ id ] )
        {
            vkDestroyBuffer( m_renderer->getDevice()->getLogicalDevice(), m_per_frame_buffer       [ id ], nullptr );
            vkFreeMemory   ( m_renderer->getDevice()->getLogicalDevice(), m_per_frame_buffer_memory[ id ], nullptr );

            m_per_frame_buffer[ id ] = VK_NULL_HANDLE;
        }

        if( VK_NULL_HANDLE != m_per_object_buffer[ id ] )
        {
            vkDestroyBuffer( m_renderer->getDevice()->getLogicalDevice(), m_per_object_buffer       [ id ], nullptr );
            vkFreeMemory   ( m_renderer->getDevice()->getLogicalDevice(), m_per_object_buffer_memory[ id ], nullptr );

            m_per_object_buffer[ id ] = VK_NULL_HANDLE;
        }
    }

    if (VK_NULL_HANDLE != m_ssao_buffer)
    {
        vkDestroyBuffer(m_renderer->getDevice()->getLogicalDevice(), m_ssao_buffer, nullptr);
        vkFreeMemory(m_renderer->getDevice()->getLogicalDevice(), m_ssao_buffer_memory, nullptr);

        m_ssao_buffer = VK_NULL_HANDLE;
    }
}