/**
 * redis_gl.h
 *
 * Copyright 2019. All Rights Reserved.
 *
 * Created: July 25, 2019
 * Authors: Toki Migimatsu
 */

#ifndef REDIS_GL_REDIS_GL_H_
#define REDIS_GL_REDIS_GL_H_

#include <string>  // std::string

#include <ctrl_utils/redis_client.h>

#include <spatial_dyn/parsers/json.h>
#include <spatial_dyn/structs/articulated_body.h>

namespace redis_gl {

namespace webapp {

const std::string kPrefix = "webapp::";
const std::string kResources = kPrefix + "resources";  // webapp::resources

}  // namespace webapp

namespace simulator {

const std::string kName = "simulator";
const std::string kPrefix = webapp::kPrefix + kName + "::";  // webapp::simulator::
const std::string kArgs = kPrefix + "args";                  // webapp::simulator::args
const std::string kInteraction = kPrefix + "interaction";    // webapp::simulator::interaction

struct ModelKeys {

  ModelKeys() = default;
  ModelKeys(const std::string& key_namespace)
      : key_robots_prefix(key_namespace + "::model::robot::"),
        key_objects_prefix(key_namespace + "::model::object::"),
        key_trajectories_prefix(key_namespace + "::model::trajectory::"),
        key_cameras_prefix(key_namespace + "::model::camera::") {}

  std::string key_robots_prefix;
  std::string key_objects_prefix;
  std::string key_trajectories_prefix;
  std::string key_cameras_prefix;

};

/**
 * Register the directory of resources for the web app.
 *
 * This needs to be done so the server knows it's safe to serve files from this directory.
 * The key "webapp::resources" will be hset with "<app_name>": "<path>".
 *
 * @param redis Redis client
 * @param path Absolute path for the resources directory
 * @param commit Commit the hset command (asynchronously).
 */
void RegisterResourcePath(ctrl_utils::RedisClient& redis,
                          const std::string& path,
                          bool commit = false) override {
  redis.hset(webapp::kResources, kName, path);
  if (commit) redis.commit();
}

void RegisterModelKeys(ctrl_utils::RedisClient& redis,
                       const ModelKeys& model_keys,
                       bool commit = false) {
  nlohmann::json args;
  args["key_robots_prefix"] = model_keys.key_robots_prefix;
  args["key_objects_prefix"] = model_keys.key_objects_prefix;
  args["key_trajectories_prefix"] = model_keys.key_trajectories_prefix;
  args["key_cameras_prefix"] = model_keys.key_cameras_prefix;
  redis.set(kArgs, args);
  if (commit) redis.commit();
}

void RegisterRobot(ctrl_utils::RedisClient& redis,
                   const ModelKeys& model_keys,
                   const spatial_dyn::ArticulatedBody& ab,
                   const std::string& key_q,
                   bool commit = false) {
  nlohmann::json model;
  model["articulated_body"] = ab;
  model["key_q"] = key_q;
  redis.set(model_keys.key_robots_prefix + ab.name, model);
  if (commit) redis.commit();
}

void RegisterObject(ctrl_utils::RedisClient& redis,
                    const ModelKeys& model_keys,
                    const std::string& name,
                    const std::vector<spatial_dyn::Graphics>& graphics,
                    const std::string& key_pos,
                    const std::string& key_ori,
                    bool commit = false) {
  nlohmann::json model;
  model["graphics"] = graphics;
  model["key_pos"] = key_pos;
  model["key_ori"] = key_ori;
  redis.set(model_keys.key_objects_prefix + name, model);
  if (commit) redis.commit();
}

void RegisterTrajectory(ctrl_utils::RedisClient& redis,
                        const ModelKeys& model_keys,
                        const std::string& name,
                        const std::string& key_pos,
                        bool commit = false) {
  nlohmann::json model;
  model["key_pos"] = key_pos;
  redis.set(model_keys.key_trajectories_prefix + name, model);
  if (commit) redis.commit();
}

void RegisterCamera(ctrl_utils::RedisClient& redis,
                    const ModelKeys& model_keys,
                    const std::string& name,
                    const std::string& key_pos,
                    const std::string& key_ori,
                    const std::string& key_intrinsic,
                    const std::string& key_depth_image,
                    const std::string& key_rgb_image = "",
                    bool commit = false) {
  nlohmann::json model;
  model["key_pos"] = key_pos;
  model["key_ori"] = key_ori;
  model["key_intrinsic"] = key_intrinsic;
  model["key_depth_image"] = key_depth_image;
  model["key_rgb_image"] = key_rgb_image;
  redis.set(model_keys.key_cameras_prefix + name, model);
  if (commit) redis.commit();
}

}  // namespace simulator

}  // namespace redis_gl

#endif  // REDIS_GL_REDIS_GL_H_
