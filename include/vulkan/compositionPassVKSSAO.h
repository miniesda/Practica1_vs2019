#pragma once

#include "vulkan/renderPassVK.h"

namespace MiniEngine
{
    struct Runtime;
    class MeshVK;
    typedef std::shared_ptr<MeshVK> MeshVKPtr;

    class CompositionPassVKSSAO final : public RenderPassVK
    {
    public:
        CompositionPassVKSSAO( 
                            const Runtime& i_runtime,
                            const ImageBlock& i_in_position_depth_attachment,
                            const ImageBlock& i_in_normal_attachment,
                            const ImageBlock& i_in_noise_attachment,
                            const ImageBlock& i_ssao_attachment
                          );
        virtual ~CompositionPassVKSSAO();

        bool            initialize() override;
        void            shutdown  () override;
        VkCommandBuffer draw      ( const Frame& i_frame ) override;

    private:
        CompositionPassVKSSAO( const CompositionPassVKSSAO& ) = delete;
        CompositionPassVKSSAO& operator=(const CompositionPassVKSSAO& ) = delete;

        void createFbo             ();
        void createRenderPass      ();
        void createPipelines       ();
        void createDescriptorLayout();
        void createDescriptors     ();

        struct DescriptorsSets
        {
            VkDescriptorSet m_textures_descriptor;
        };

        VkRenderPass                   m_render_pass;
        std::array<VkCommandBuffer, 3> m_command_buffer;
        std::array<VkFramebuffer  , 3> m_fbos;

        // prepare the different render supported depending on the material
        VkPipeline                                                         m_composition_pipeline;
        VkPipelineLayout                                                   m_pipeline_layouts;
        VkDescriptorSetLayout                                              m_descriptor_set_layout; //2 sets, per frame and per object
        VkDescriptorPool                                                   m_descriptor_pool;
        std::array<DescriptorsSets                , kMAX_NUMBER_OF_FRAMES> m_descriptor_sets; //3
        std::array<VkPipelineShaderStageCreateInfo, 2                    > m_shader_stages;
    
        MeshVKPtr m_plane;

        ImageBlock m_in_position_depth_attachment;
        ImageBlock m_in_normal_attachment;
        ImageBlock m_in_noise_attachment;
        ImageBlock m_ssao_attachment;
    };
};
