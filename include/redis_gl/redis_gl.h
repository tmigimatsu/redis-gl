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

// std
#include <array>    // std::array
#include <set>      // std::set
#include <sstream>  // std::stringstream
#include <string>   // std::string
#include <utility>  // std::move

// external
#include <ctrl_utils/json.h>
#include <ctrl_utils/redis_client.h>

namespace redis_gl {

namespace webapp {

const std::string KEY_PREFIX = "webapp::";
const std::string KEY_RESOURCES_PREFIX =
    KEY_PREFIX + "resources::";  // webapp::resources::

}  // namespace webapp

namespace simulator {

const std::string kName = "simulator";
const std::string KEY_PREFIX =
    webapp::KEY_PREFIX + kName + "::";             // webapp::simulator::
const std::string KEY_ARGS = KEY_PREFIX + "args";  // webapp::simulator::args
const std::string KEY_INTERACTION =
    KEY_PREFIX + "interaction";  // webapp::simulator::interaction
const std::string KEY_RESOURCES =
    webapp::KEY_RESOURCES_PREFIX + kName;  // webapp::resources::simulator

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

struct CameraModel {
  std::string name;
  std::string key_pos;
  std::string key_ori;
  std::string key_intrinsic;
  std::string key_depth_image;
  std::string key_color_image;
};

inline void from_json(const nlohmann::json& json, CameraModel& camera) {
  camera.name = json.at("name").get<std::string>();
  camera.key_pos = json.at("key_pos").get<std::string>();
  camera.key_ori = json.at("key_ori").get<std::string>();
  camera.key_intrinsic = json.at("key_intrinsic").get<std::string>();
  camera.key_depth_image = json.at("key_depth_image").get<std::string>();
  camera.key_color_image = json.at("key_color_image").get<std::string>();
}

inline void to_json(nlohmann::json& json, const CameraModel& camera) {
  json["name"] = camera.name;
  json["key_pos"] = camera.key_pos;
  json["key_ori"] = camera.key_ori;
  json["key_intrinsic"] = camera.key_intrinsic;
  json["key_depth_image"] = camera.key_depth_image;
  json["key_color_image"] = camera.key_color_image;
}

inline std::stringstream& operator<<(std::stringstream& ss,
                                     const CameraModel& object) {
  ss << nlohmann::json(object).dump();
  return ss;
}

inline std::stringstream& operator>>(std::stringstream& ss,
                                     CameraModel& object) {
  nlohmann::json json = nlohmann::json::parse(ss.str());
  ss.seekg(ss.str().size());
  object = json.get<CameraModel>();
  return ss;
}

struct Interaction {
  enum class Key { kUndefined, kAlt, kCtrl, kMeta, kShift };

  std::string key_object;
  int idx_link = 0;
  Eigen::Vector3d pos_click_in_link = Eigen::Vector3d::Zero();
  Eigen::Vector3d pos_mouse_in_world = Eigen::Vector3d::Zero();
  std::set<Key> modifier_keys;
  std::string key_down;
};

inline Eigen::Vector3d ClickPositionAdjustment(
    const redis_gl::simulator::Interaction& interaction,
    const Eigen::Vector3d& pos, const Eigen::Quaterniond& quat,
    double gain = 1e-2) {
  const Eigen::Isometry3d T_object_to_world = Eigen::Translation3d(pos) * quat;
  const Eigen::Vector3d pos_click_in_world =
      T_object_to_world * interaction.pos_click_in_link;

  return gain * (interaction.pos_mouse_in_world - pos_click_in_world);
}

inline Eigen::AngleAxisd ClickOrientationAdjustment(
    const redis_gl::simulator::Interaction& interaction,
    const Eigen::Vector3d& pos, const Eigen::Quaterniond& quat,
    double gain = 1e-1) {
  const Eigen::Isometry3d T_object_to_world = Eigen::Translation3d(pos) * quat;
  const Eigen::Vector3d pos_click_in_world =
      T_object_to_world * interaction.pos_click_in_link;

  const Eigen::Vector3d m_click =
      gain * (interaction.pos_mouse_in_world - pos_click_in_world);
  const Eigen::Vector3d r_com =
      (pos_click_in_world - T_object_to_world.translation()).normalized();
  const Eigen::Vector3d r_com_x_m_click = r_com.cross(m_click);
  return Eigen::AngleAxisd(r_com_x_m_click.norm(),
                           r_com_x_m_click.normalized());
}

inline void ClickAdjustPose(const redis_gl::simulator::Interaction& interaction,
                            Eigen::Vector3d* pos, Eigen::Quaterniond* ori,
                            double gain_pos = 1e-2, double gain_ori = 1e-1) {
  if (interaction.modifier_keys.find(
          redis_gl::simulator::Interaction::Key::kCtrl) !=
      interaction.modifier_keys.end()) {
    *ori = ClickOrientationAdjustment(interaction, *pos, *ori, gain_ori) * *ori;
  } else {
    *pos += ClickPositionAdjustment(interaction, *pos, *ori, gain_pos);
  }
}

inline Eigen::Vector3d KeypressPositionAdjustment(
    const Interaction& interaction, double gain = 1e-4) {
  if (interaction.key_down.empty()) return Eigen::Vector3d::Zero();

  size_t idx = 0;
  int sign = 1;
  switch (interaction.key_down[0]) {
    case 'a':
      idx = 0;
      sign = -1;
      break;
    case 'd':
      idx = 0;
      sign = 1;
      break;
    case 'w':
      idx = 1;
      sign = 1;
      break;
    case 's':
      idx = 1;
      sign = -1;
      break;
    case 'e':
      idx = 2;
      sign = 1;
      break;
    case 'q':
      idx = 2;
      sign = -1;
      break;
    default:
      return Eigen::Vector3d::Zero();
  }
  return sign * gain * Eigen::Vector3d::Unit(idx);
}

inline Eigen::AngleAxisd KeypressOrientationAdjustment(
    const Interaction& interaction, double gain = 1e-3) {
  if (interaction.key_down.empty()) return Eigen::AngleAxisd::Identity();

  size_t idx = 0;
  int sign = 1;
  switch (interaction.key_down[0]) {
    case 'j':
      idx = 0;
      sign = -1;
      break;
    case 'l':
      idx = 0;
      sign = 1;
      break;
    case 'i':
      idx = 1;
      sign = 1;
      break;
    case 'k':
      idx = 1;
      sign = -1;
      break;
    case 'o':
      idx = 2;
      sign = 1;
      break;
    case 'u':
      idx = 2;
      sign = -1;
      break;
    default:
      return Eigen::AngleAxisd::Identity();
  }
  return Eigen::AngleAxisd(sign * gain, Eigen::Vector3d::Unit(idx));
}

inline void from_json(const nlohmann::json& json, Interaction::Key& key) {
  std::string str_key = json.get<std::string>();
  if (str_key == "alt")
    key = Interaction::Key::kAlt;
  else if (str_key == "ctrl")
    key = Interaction::Key::kCtrl;
  else if (str_key == "meta")
    key = Interaction::Key::kMeta;
  else if (str_key == "shift")
    key = Interaction::Key::kShift;
  else
    key = Interaction::Key::kUndefined;
}

inline void from_json(const nlohmann::json& json, Interaction& interaction) {
  interaction.key_object = json["key_object"].get<std::string>();
  interaction.idx_link = json["idx_link"].get<int>();
  const std::array<double, 3> pos_click_in_link =
      json["pos_click_in_link"].get<std::array<double, 3>>();
  const std::array<double, 3> pos_mouse_in_world =
      json["pos_mouse_in_world"].get<std::array<double, 3>>();
  interaction.pos_click_in_link =
      Eigen::Map<const Eigen::Vector3d>(pos_click_in_link.data());
  interaction.pos_mouse_in_world =
      Eigen::Map<const Eigen::Vector3d>(pos_mouse_in_world.data());
  interaction.modifier_keys =
      json["modifier_keys"].get<std::set<Interaction::Key>>();
  interaction.key_down = json["key_down"].get<std::string>();
}

inline void to_json(nlohmann::json& json, const Interaction& interaction) {
  json["key_object"] = interaction.key_object;
  json["idx_link"] = interaction.idx_link;
  json["pos_click_in_link"] = interaction.pos_click_in_link;
  json["pos_mouse_in_world"] = interaction.pos_mouse_in_world;
  json["modifier_keys"] = interaction.modifier_keys;
  json["key_down"] = interaction.key_down;
}

inline std::stringstream& operator>>(std::stringstream& ss, Interaction& interaction) {
  nlohmann::json json;
  ss >> json;
  interaction = json.get<Interaction>();
  return ss;
}

inline std::stringstream& operator<<(std::stringstream& ss, const Interaction& interaction) {
  ss << nlohmann::json(interaction).dump();
  return ss;
}

/**
 * Register the directory of resources for the web app.
 *
 * This needs to be done so the server knows it's safe to serve files from this
 * directory. The key "webapp::resources" will be hset with "<app_name>":
 * "<path>".
 *
 * @param redis Redis client
 * @param path Absolute path for the resources directory
 * @param commit Commit the hset command (asynchronously).
 */
inline void RegisterResourcePath(ctrl_utils::RedisClient& redis,
                                 const std::string& path, bool commit = false) {
  redis.sadd(KEY_RESOURCES, {path});
  if (commit) redis.commit();
}

inline void UnregisterResourcePath(ctrl_utils::RedisClient& redis,
                                   const std::string& path,
                                   bool commit = false) {
  redis.srem(KEY_RESOURCES, {path});
  if (commit) redis.commit();
}

inline void RegisterModelKeys(ctrl_utils::RedisClient& redis,
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

inline void UnregisterModelKeys(ctrl_utils::RedisClient& redis,
                                const ModelKeys& model_keys,
                                bool commit = false) {
  redis.del({KEY_ARGS + "::" + model_keys.key_namespace});
  if (commit) redis.commit();
}

inline void ClearModelKeys(ctrl_utils::RedisClient& redis,
                           const ModelKeys& model_keys, bool commit = true) {
  std::array<std::future<std::unordered_set<std::string>>, 4> fut_keys = {
      redis.scan(model_keys.key_robots_prefix + "*"),
      redis.scan(model_keys.key_objects_prefix + "*"),
      redis.scan(model_keys.key_trajectories_prefix + "*"),
      redis.scan(model_keys.key_cameras_prefix + "*"),
  };
  redis.commit();
  for (auto& fut_keys_batch : fut_keys) {
    const auto keys_batch = fut_keys_batch.get();
    std::vector<std::string> keys;
    keys.insert(keys.end(), keys_batch.begin(), keys_batch.end());
    redis.del(keys);
  }
  if (commit) redis.commit();
}

inline void RegisterTrajectory(ctrl_utils::RedisClient& redis,
                               const ModelKeys& model_keys,
                               const std::string& name,
                               const std::string& key_pos,
                               bool commit = false) {
  nlohmann::json model;
  model["key_pos"] = key_pos;
  redis.set(model_keys.key_trajectories_prefix + name, model);
  if (commit) redis.commit();
}

inline void RegisterCamera(ctrl_utils::RedisClient& redis,
                           const ModelKeys& model_keys, const std::string& name,
                           const std::string& key_pos,
                           const std::string& key_ori,
                           const std::string& key_intrinsic,
                           const std::string& key_depth_image,
                           const std::string& key_color_image = "",
                           bool commit = false) {
  nlohmann::json model;
  model["key_pos"] = key_pos;
  model["key_ori"] = key_ori;
  model["key_intrinsic"] = key_intrinsic;
  model["key_depth_image"] = key_depth_image;
  model["key_color_image"] = key_color_image;
  redis.set(model_keys.key_cameras_prefix + name, model);
  if (commit) redis.commit();
}

inline void RegisterCamera(ctrl_utils::RedisClient& redis,
                           const ModelKeys& model_keys,
                           const CameraModel& camera, bool commit = false) {
  nlohmann::json json(camera);
  redis.set(model_keys.key_cameras_prefix + camera.name, json);
  if (commit) redis.commit();
}

// std::future<Interaction> GetInteraction(ctrl_utils::RedisClient& redis, bool
// commit = false) {
//   auto promise = std::make_shared<std::promise<Interaction>>();
//   redis.get<nlohmann::json>(KEY_INTERACTION, [promise](const nlohmann::json&
//   json) {
//     promise->set_value(json.get<Interaction>());
//   });
//   if (commit) redis.commit();
//   return promise->get_future();
// }

}  // namespace simulator

}  // namespace redis_gl

#endif  // REDIS_GL_REDIS_GL_H_
