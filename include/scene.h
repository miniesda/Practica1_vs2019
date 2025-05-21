#pragma once

#include "common.h"
#include "runtime.h"
 
namespace MiniEngine
{
    class Camera;
    class Light;
    class Entity;
    class Material;
    
    typedef std::shared_ptr<Camera>     CameraPtr;
    typedef std::shared_ptr<Light >     LightPtr;
    typedef std::shared_ptr<Entity>     EntityPtr;
    typedef std::shared_ptr<Material>   MaterialPtr;

    class Scene final 
    {
    public:
        explicit Scene( const Runtime& i_runtime, const std::string& i_path ) : m_runtime( i_runtime ), m_path( i_path ), bufferTlas (VK_NULL_HANDLE){}
        ~Scene();

        bool initialize();
        void shutdown  ();

        static std::shared_ptr<Scene> loadScene( const Runtime& i_runtime, const std::string& i_path );
    
        /// Return a pointer to the scene's camera
        const Camera& getCamera() const 
        { 
            return *m_camera; 
        }
    
        const std::vector<EntityPtr>& getMeshes() const 
        {
            return m_entities; 
        }

        const std::vector<LightPtr>& getLights() const
        {
            return m_lights;
        }

        const std::string& getPath() const
        {
            return m_path;
        }

        const VkAccelerationStructureKHR& getAccelStructure() const
        {
            return accelerationTlas;
        }

    private:
        Scene( const Scene& ) = delete;
        Scene& operator=(const Scene& ) = delete;

        const Runtime&         m_runtime;
        const std::string      m_path;
        std::vector<LightPtr > m_lights;
        std::vector<EntityPtr> m_entities;
        CameraPtr              m_camera;

        VkAccelerationStructureKHR accelerationTlas;
        VkBuffer bufferTlas;
        VkDeviceMemory memoryTlas;
    };
};