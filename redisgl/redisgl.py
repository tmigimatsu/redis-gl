from __future__ import annotations

import abc
import dataclasses
import json
from typing import Any, Sequence

import ctrlutils
import numpy as np
import spatialdyn as dyn


KEY_ARGS = "webapp::simulator::args"
KEY_RESOURCES = "webapp::resources::simulator"


@dataclasses.dataclass
class Pose:
    """6d pose.

    Args:
        pos: 3d position.
        quat: xyzw quaternion.
    """

    pos: np.ndarray = np.zeros(3)
    quat: np.ndarray = np.array([0.0, 0.0, 0.0, 1.0])

    def from_dict(self, pose: dict[str, Any]) -> Pose:
        """Creates a pose from dict format."""
        return Pose(
            np.array(pose["pose"]),
            np.array(
                [pose["ori"]["x"], pose["ori"]["y"], pose["ori"]["z"], pose["ori"]["w"]]
            ),
        )

    def to_dict(self) -> dict[str, Any]:
        """Converts a pose to dict format."""
        return {
            "pos": self.pos.tolist(),
            "ori": {
                "x": self.quat[0],
                "y": self.quat[1],
                "z": self.quat[2],
                "w": self.quat[3],
            },
        }


class Geometry(abc.ABC):
    @abc.abstractmethod
    def to_dict(self) -> dict[str, Any]:
        pass


class Box(Geometry):
    type = "box"

    def __init__(self, scale: Sequence[float] | np.ndarray):
        self.scale = list(scale)

    def to_dict(self) -> dict[str, Any]:
        return {
            "type": self.type,
            "scale": self.scale,
        }


class Capsule(Geometry):
    type = "capsule"

    def __init__(self, radius: float, length: float):
        self.radius = radius
        self.length = length

    def to_dict(self) -> dict[str, Any]:
        return {
            "type": self.type,
            "radius": self.radius,
            "length": self.length,
        }


class Cylinder(Geometry):
    type = "cylinder"

    def __init__(self, radius: float, length: float):
        self.radius = radius
        self.length = length

    def to_dict(self) -> dict[str, Any]:
        return {
            "type": self.type,
            "radius": self.radius,
            "length": self.length,
        }


class Sphere(Geometry):
    type = "sphere"

    def __init__(self, radius: float):
        self.radius = radius

    def to_dict(self) -> dict[str, Any]:
        return {
            "type": self.type,
            "radius": self.radius,
        }


class Mesh(Geometry):
    type = "mesh"

    def __init__(self, path: str, scale: Sequence[float] | np.ndarray):
        self.path = path
        self.scale = list(scale)

    def to_dict(self) -> dict[str, Any]:
        return {
            "type": self.type,
            "mesh": self.path,
            "scale": self.scale,
        }


@dataclasses.dataclass
class Material:
    name: str = ""
    rgba: tuple[float, float, float, float] = (1.0, 1.0, 1.0, 1.0)
    texture: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "rgba": self.rgba,
            "texture": self.texture,
        }


@dataclasses.dataclass
class Graphics:
    name: str
    geometry: Geometry
    material: Material = Material()
    T_to_parent: Pose = Pose()

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "T_to_parent": self.T_to_parent.to_dict(),
            "geometry": self.geometry.to_dict(),
            "material": self.material.to_dict(),
        }


@dataclasses.dataclass
class ModelKeys:
    key_namespace: str
    key_robots_prefix: str
    key_objects_prefix: str
    key_trajectories_prefix: str
    key_cameras_prefix: str
    key_images_prefix: str

    def __init__(self, key_namespace: str):
        self.key_namespace = key_namespace
        self.key_robots_prefix = key_namespace + "::model::robot::"
        self.key_objects_prefix = key_namespace + "::model::object::"
        self.key_trajectories_prefix = key_namespace + "::model::trajectory::"
        self.key_cameras_prefix = key_namespace + "::model::camera::"
        self.key_images_prefix = key_namespace + "::model::image::"

    def to_dict(self) -> dict[str, Any]:
        return {
            "key_robots_prefix": self.key_robots_prefix,
            "key_objects_prefix": self.key_objects_prefix,
            "key_trajectories_prefix": self.key_trajectories_prefix,
            "key_cameras_prefix": self.key_cameras_prefix,
            "key_images_prefix": self.key_images_prefix,
        }


@dataclasses.dataclass
class ObjectModel:
    name: str
    graphics: Graphics | Sequence[Graphics]
    key_pos: str = ""
    key_ori: str = ""
    key_scale: str = ""
    key_matrix: str = ""
    axis_size: float = 0.1

    def to_dict(self) -> dict[str, Any]:
        graphics = (
            [self.graphics] if isinstance(self.graphics, Graphics) else self.graphics
        )
        return {
            "graphics": [g.to_dict() for g in graphics],
            "key_pos": self.key_pos,
            "key_ori": self.key_ori,
            "key_scale": self.key_scale,
            "key_matrix": self.key_matrix,
            "axis_size": self.axis_size,
        }


@dataclasses.dataclass
class RobotModel:
    articulated_body: dyn.ArticulatedBody
    key_q: str
    key_pos: str = ""
    key_ori: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "articulated_body": json.loads(str(self.articulated_body)),
            "key_q": self.key_q,
            "key_pos": self.key_pos,
            "key_ori": self.key_ori,
        }


@dataclasses.dataclass
class CameraModel:
    name: str
    key_pos: str
    key_ori: str
    key_intrinsic: str
    key_depth_image: str
    key_color_image: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "key_pos": self.key_pos,
            "key_ori": self.key_ori,
            "key_intrinsic": self.key_intrinsic,
            "key_depth_image": self.key_depth_image,
            "key_color_image": self.key_color_image,
        }


@dataclasses.dataclass
class TrajectoryModel:
    name: str
    key_pos: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "key_pos": self.key_pos,
        }


@dataclasses.dataclass
class ImageModel:
    name: str
    key_image: str
    key_segmentations: tuple[str] = ()

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "key_image": self.key_image,
            "key_segmentations": self.key_segmentations,
        }


def register_resource_path(redis: ctrlutils.RedisClient, path: str) -> None:
    """Registers a resource path with redisgl.

    This path will be used to search for assets (e.g. meshes in URDF files).
    Note that this exposes all files inside the resource folder to the outside
    world.
    """
    redis.sadd(KEY_RESOURCES, path)


def unregister_resource_path(redis: ctrlutils.RedisClient, path: str) -> None:
    """Unregisters a resource path with redisgl.

    This should be called upon closing the app to ensure files inside the
    resource folder aren't exposed to the outside world for longer than
    necessary.
    """
    redis.srem(KEY_RESOURCES, path)


def register_model_keys(redis: ctrlutils.RedisClient, model_keys: ModelKeys) -> None:
    """Registers an app's namespace with redisgl.

    Args:
        redis: Redis client.
        model_keys: Redisgl app namespace.
    """
    redis.set(
        f"{KEY_ARGS}::{model_keys.key_namespace}", json.dumps(model_keys.to_dict())
    )


def unregister_model_keys(redis: ctrlutils.RedisClient, model_keys: ModelKeys) -> None:
    """Unregisters an app's namespace with redisgl.

    Args:
        redis: Redis client.
        model_keys: Redisgl app namespace.
    """
    redis.delete(f"{KEY_ARGS}::{model_keys.key_namespace}")


def register_object(
    redis: ctrlutils.RedisClient, model_keys: ModelKeys, object: ObjectModel
) -> None:
    """Registers an object with Redis.

    Args:
        redis: Redis client.
        model_keys: Redisgl app namespace.
        object_model: Object model.
    """
    redis.set(model_keys.key_objects_prefix + object.name, json.dumps(object.to_dict()))


def unregister_object(
    redis: ctrlutils.RedisClient, model_keys: ModelKeys, name: str
) -> None:
    """Unregisters an object with redisgl.

    Args:
        redis: Redis client.
        name: Object name.espace.
        object_model: Object model.
    """
    redis.delete(model_keys.key_objects_prefix + name)


def register_robot(
    redis: ctrlutils.RedisClient, model_keys: ModelKeys, robot: RobotModel
) -> None:
    """Registers a robot with redisgl.

    Args:
        redis: Redis client.
        model_keys: Redisgl app namespace.
        robot: Robot model.
    """
    redis.set(
        model_keys.key_robots_prefix + robot.articulated_body.name,
        json.dumps(robot.to_dict()),
    )


def unregister_robot(
    redis: ctrlutils.RedisClient, model_keys: ModelKeys, robot: RobotModel
) -> None:
    """Unregisters a robot with redisgl.

    Args:
        redis: Redis client.
        model_keys: Redisgl app namespace.
        robot: Robot model.
    """
    redis.delete(model_keys.key_robots_prefix + robot.articulated_body.name)


def register_camera(
    redis: ctrlutils.RedisClient, model_keys: ModelKeys, camera: CameraModel
) -> None:
    """Registers a camera with redisgl.

    Args:
        redis: Redis client.
        model_keys: Redisgl app namespace.
        camera: Camera model.
    """
    redis.set(
        model_keys.key_cameras_prefix + camera.name,
        json.dumps(camera.to_dict()),
    )


def unregister_camera(
    redis: ctrlutils.RedisClient, model_keys: ModelKeys, camera: CameraModel
) -> None:
    """Unregisters a camera with redisgl.

    Args:
        redis: Redis client.
        model_keys: Redisgl app namespace.
        camera: Camera model.
    """
    redis.delete(model_keys.key_cameras_prefix + camera.name)


def register_trajectory(
    redis: ctrlutils.RedisClient, model_keys: ModelKeys, trajectory: TrajectoryModel
) -> None:
    """Registers a trajectory with redisgl.

    Args:
        redis: Redis client.
        model_keys: Redisgl app namespace.
        trajectory: Trajectory model.
    """
    redis.set(
        model_keys.key_trajectories_prefix + trajectory.name,
        json.dumps(trajectory.to_dict()),
    )


def unregister_trajectory(
    redis: ctrlutils.RedisClient, model_keys: ModelKeys, trajectory: TrajectoryModel
) -> None:
    """Unregisters a camera with redisgl.

    Args:
        redis: Redis client.
        model_keys: Redisgl app namespace.
        trajectory: Trajectory model.
    """
    redis.delete(model_keys.key_trajectories_prefix + trajectory.name)


def register_image(
    redis: ctrlutils.RedisClient, model_keys: ModelKeys, image: ImageModel
) -> None:
    """Registers an image with redisgl.

    Args:
        redis: Redis client.
        model_keys: Redisgl app namespace.
        image: Image model.
    """
    redis.set(
        model_keys.key_images_prefix + image.name,
        json.dumps(image.to_dict()),
    )


def unregister_image(
    redis: ctrlutils.RedisClient, model_keys: ModelKeys, image: ImageModel
) -> None:
    """Unregisters a camera with redisgl.

    Args:
        redis: Redis client.
        model_keys: Redisgl app namespace.
        image: Image model.
    """
    redis.delete(model_keys.key_images_prefix + image.name)
