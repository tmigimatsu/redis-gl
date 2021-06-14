/**
 * robot.h
 *
 * Copyright 2019. All Rights Reserved.
 *
 * Created: July 25, 2019
 * Authors: Toki Migimatsu
 */

#ifndef REDIS_GL_ROBOT_H_
#define REDIS_GL_ROBOT_H_

#include "redis_gl/redis_gl.h"

// external
#include <spatial_dyn/algorithms/forward_kinematics.h>
#include <spatial_dyn/structs/articulated_body.h>

namespace redis_gl {

namespace simulator {

const std::string kName = "simulator";
const std::string KEY_PREFIX =
    webapp::KEY_PREFIX + kName + "::";             // webapp::simulator::
const std::string KEY_ARGS = KEY_PREFIX + "args";  // webapp::simulator::args
const std::string KEY_INTERACTION =
    KEY_PREFIX + "interaction";  // webapp::simulator::interaction
const std::string KEY_RESOURCES =
    webapp::KEY_RESOURCES_PREFIX + kName;  // webapp::resources::simulator

struct ObjectModel {
  std::string name;
  std::vector<spatial_dyn::Graphics> graphics;
  std::string key_pos;
  std::string key_ori;
};

inline void from_json(const nlohmann::json& json, ObjectModel& object) {
  object.name = json.at("name").get<std::string>();
  object.graphics =
      json.at("graphics").get<std::vector<spatial_dyn::Graphics>>();
  object.key_pos = json.at("key_pos").get<std::string>();
  object.key_ori = json.at("key_ori").get<std::string>();
}

inline void to_json(nlohmann::json& json, const ObjectModel& object) {
  json["name"] = object.name;
  json["graphics"] = object.graphics;
  json["key_pos"] = object.key_pos;
  json["key_ori"] = object.key_ori;
}

inline std::stringstream& operator<<(std::stringstream& ss,
                                     const ObjectModel& object) {
  ss << nlohmann::json(object).dump();
  return ss;
}

inline std::stringstream& operator>>(std::stringstream& ss,
                                     ObjectModel& object) {
  nlohmann::json json = nlohmann::json::parse(ss.str());
  ss.seekg(ss.str().size());
  object = json.get<ObjectModel>();
  return ss;
}

struct RobotModel {
  std::shared_ptr<spatial_dyn::ArticulatedBody> articulated_body;
  std::string key_q;
  std::string key_pos;
  std::string key_ori;
};

inline void from_json(const nlohmann::json& json, RobotModel& robot) {
  robot.articulated_body = std::make_shared<spatial_dyn::ArticulatedBody>(
      json.at("articulated_body").get<spatial_dyn::ArticulatedBody>());
  robot.key_q = json.at("key_q").get<std::string>();
  robot.key_pos = json.at("key_pos").get<std::string>();
  robot.key_ori = json.at("key_ori").get<std::string>();
}

inline void to_json(nlohmann::json& json, const RobotModel& robot) {
  json["articulated_body"] = *robot.articulated_body;
  json["key_q"] = robot.key_q;
  json["key_pos"] = robot.key_pos;
  json["key_ori"] = robot.key_ori;
}

inline std::stringstream& operator<<(std::stringstream& ss,
                                     const RobotModel& object) {
  ss << nlohmann::json(object).dump();
  return ss;
}

inline std::stringstream& operator>>(std::stringstream& ss,
                                     RobotModel& object) {
  nlohmann::json json = nlohmann::json::parse(ss.str());
  ss.seekg(ss.str().size());
  object = json.get<RobotModel>();
  return ss;
}

inline std::map<size_t, spatial_dyn::SpatialForced> ComputeExternalForces(
    const redis_gl::simulator::ModelKeys& model_keys,
    const spatial_dyn::ArticulatedBody& ab,
    const redis_gl::simulator::Interaction& interaction, double gain = 100.) {
  std::map<size_t, spatial_dyn::SpatialForced> f_ext;

  // Check if the clicked object is the robot
  if (interaction.key_object != model_keys.key_robots_prefix + ab.name)
    return f_ext;

  // Get the click position in world coordinates
  const Eigen::Vector3d pos_click_in_world = spatial_dyn::Position(
      ab, interaction.idx_link, interaction.pos_click_in_link);

  // Set the click force
  const Eigen::Vector3d f =
      gain * (interaction.pos_mouse_in_world - pos_click_in_world);
  spatial_dyn::SpatialForced f_click(f, Eigen::Vector3d::Zero());

  // Translate the spatial force to the world frame
  f_ext[interaction.idx_link] =
      Eigen::Translation3d(pos_click_in_world) * f_click;

  return f_ext;
}

inline void RegisterRobot(ctrl_utils::RedisClient& redis,
                          const ModelKeys& model_keys, const RobotModel& robot,
                          bool commit = false) {
  nlohmann::json json(robot);
  redis.set(model_keys.key_robots_prefix + robot.articulated_body->name, json);
  if (commit) redis.commit();
}

inline void RegisterRobot(ctrl_utils::RedisClient& redis,
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

inline void RegisterObject(ctrl_utils::RedisClient& redis,
                           const ModelKeys& model_keys, const std::string& name,
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

inline void RegisterObject(ctrl_utils::RedisClient& redis,
                           const ModelKeys& model_keys,
                           const spatial_dyn::Graphics& graphics,
                           const std::string& key_pos,
                           const std::string& key_ori = "",
                           bool commit = false) {
  nlohmann::json model;
  model["graphics"] = {graphics};
  model["key_pos"] = key_pos;
  model["key_ori"] = key_ori;
  redis.set(model_keys.key_objects_prefix + graphics.name, model);
  if (commit) redis.commit();
}

inline void RegisterObject(ctrl_utils::RedisClient& redis,
                           const ModelKeys& model_keys,
                           const ObjectModel& object, bool commit = false) {
  nlohmann::json json(object);
  redis.set(model_keys.key_objects_prefix + object.name, json);
}

}  // namespace simulator

}  // namespace redis_gl

#endif  // REDIS_GL_ROBOT_H_
