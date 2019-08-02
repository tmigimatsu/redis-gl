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

#include <set>      // std::set
#include <sstream>  // std::stringstream
#include <string>   // std::string
#include <utility>  // std::move

#include <ctrl_utils/redis_client.h>

#include <spatial_dyn/parsers/json.h>
#include <spatial_dyn/structs/articulated_body.h>

namespace redis_gl {

namespace webapp {

const std::string KEY_PREFIX = "webapp::";
const std::string KEY_RESOURCES_PREFIX = KEY_PREFIX + "resources::";  // webapp::resources::

}  // namespace webapp

namespace simulator {

const std::string kName = "simulator";
const std::string KEY_PREFIX = webapp::KEY_PREFIX + kName + "::";  // webapp::simulator::
const std::string KEY_ARGS = KEY_PREFIX + "args";                  // webapp::simulator::args
const std::string KEY_INTERACTION = KEY_PREFIX + "interaction";    // webapp::simulator::interaction
const std::string KEY_RESOURCES = webapp::KEY_RESOURCES_PREFIX + kName;  // webapp::resources::simulator

struct ModelKeys {

  ModelKeys() = default;
  ModelKeys(const std::string& key_namespace)
      : key_namespace(key_namespace),
        key_robots_prefix(key_namespace + "::model::robot::"),
        key_objects_prefix(key_namespace + "::model::object::"),
        key_trajectories_prefix(key_namespace + "::model::trajectory::"),
        key_cameras_prefix(key_namespace + "::model::camera::") {}

  std::string key_namespace;
  std::string key_robots_prefix;
  std::string key_objects_prefix;
  std::string key_trajectories_prefix;
  std::string key_cameras_prefix;

};

struct Interaction {

  enum class Key {
    kUndefined,
    kAlt,
    kCtrl,
    kMeta,
    kShift
  };

  std::string key_object;
  int idx_link;
  Eigen::Vector3d pos_click_in_link;
  Eigen::Vector3d pos_mouse_in_world;
  std::set<Key> modifier_keys;
  std::string key_down;

};

void from_json(const nlohmann::json& json, Interaction::Key& key) {
  std::string str_key = json.get<std::string>();
  if (str_key == "alt") key = Interaction::Key::kAlt;
  else if (str_key == "ctrl") key = Interaction::Key::kCtrl;
  else if (str_key == "meta") key = Interaction::Key::kMeta;
  else if (str_key == "shift") key = Interaction::Key::kShift;
  else key = Interaction::Key::kUndefined;
}

void from_json(const nlohmann::json& json, Interaction& interaction) {
  interaction.key_object = json["key_object"].get<std::string>();
  interaction.idx_link = json["idx_link"].get<int>();
  const std::array<double, 3> pos_click_in_link = json["pos_click_in_link"].get<std::array<double, 3>>();
  const std::array<double, 3> pos_mouse_in_world = json["pos_mouse_in_world"].get<std::array<double, 3>>();
  interaction.pos_click_in_link = Eigen::Map<const Eigen::Vector3d>(pos_click_in_link.data());
  interaction.pos_mouse_in_world = Eigen::Map<const Eigen::Vector3d>(pos_mouse_in_world.data());
  interaction.modifier_keys = json["modifier_keys"].get<std::set<Interaction::Key>>();
  interaction.key_down = json["key_down"].get<std::string>();
}

std::stringstream& operator>>(std::stringstream& ss, Interaction& interaction) {
  nlohmann::json json;
  ss >> json;
  interaction = json.get<Interaction>();
  return ss;
}

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
                          bool commit = false) {
  redis.sadd(KEY_RESOURCES, { path });
  if (commit) redis.commit();
}

void UnregisterResourcePath(ctrl_utils::RedisClient& redis,
                            const std::string& path,
                            bool commit = false) {
  redis.srem(KEY_RESOURCES, { path });
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
  redis.set(KEY_ARGS + "::" + model_keys.key_namespace, args);
  if (commit) redis.commit();
}

void UnregisterModelKeys(ctrl_utils::RedisClient& redis,
                         const ModelKeys& model_keys,
                         bool commit = false) {
  redis.del({ KEY_ARGS + "::" + model_keys.key_namespace });
  if (commit) redis.commit();
}

void RegisterRobot(ctrl_utils::RedisClient& redis,
                   const ModelKeys& model_keys,
                   const spatial_dyn::ArticulatedBody& ab,
                   const std::string& key_q,
                   const std::string& key_pos = "",
                   const std::string& key_ori = "",
                   bool commit = false) {
  nlohmann::json model;
  model["articulated_body"] = ab;
  model["key_q"] = key_q;
  model["key_pos"] = key_pos;
  model["key_ori"] = key_ori;
  redis.set(model_keys.key_robots_prefix + ab.name, model);
  if (commit) redis.commit();
}

void RegisterObject(ctrl_utils::RedisClient& redis,
                    const ModelKeys& model_keys,
                    const std::string& name,
                    const std::vector<spatial_dyn::Graphics>& graphics,
                    const std::string& key_pos,
                    const std::string& key_ori = "",
                    bool commit = false) {
  nlohmann::json model;
  model["graphics"] = graphics;
  model["key_pos"] = key_pos;
  model["key_ori"] = key_ori;
  redis.set(model_keys.key_objects_prefix + name, model);
  if (commit) redis.commit();
}

void RegisterObject(ctrl_utils::RedisClient& redis,
                    const ModelKeys& model_keys,
                    const spatial_dyn::Graphics& graphics,
                    const std::string& key_pos,
                    const std::string& key_ori = "",
                    bool commit = false) {
  nlohmann::json model;
  model["graphics"] = { graphics };
  model["key_pos"] = key_pos;
  model["key_ori"] = key_ori;
  redis.set(model_keys.key_objects_prefix + graphics.name, model);
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

// std::future<Interaction> GetInteraction(ctrl_utils::RedisClient& redis, bool commit = false) {
//   auto promise = std::make_shared<std::promise<Interaction>>();
//   redis.get<nlohmann::json>(KEY_INTERACTION, [promise](const nlohmann::json& json) {
//     promise->set_value(json.get<Interaction>());
//   });
//   if (commit) redis.commit();
//   return promise->get_future();
// }

}  // namespace simulator

}  // namespace redis_gl

#endif  // REDIS_GL_REDIS_GL_H_
