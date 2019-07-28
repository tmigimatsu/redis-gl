/**
 * simulator.js
 *
 * Author: Toki Migimatsu
 * Created: December 2017
 */

import * as Camera from "./camera.js"
import * as Graphics from "./graphics.js"
import * as GraphicsObject from "./object.js"
import * as Redis from "./redis.js"
import * as Robot from "./robot.js"
import * as Trajectory from "./trajectory.js"

var AXIS_WIDTH = 0.005;
var AXIS_SIZE  = 0.1;

var KEY_ARGS          = "webapp::simulator::args";
var KEY_INTERACTION   = "webapp::simulator::interaction";
var KEY_CAMERA_POS    = "webapp::simulator::camera::pos";
var KEY_CAMERA_TARGET = "webapp::simulator::camera::target";
var KEY_TRAJ_RESET    = "webapp::simulator::trajectory::reset";

var SCHEMA_ARGS = {
  key_cameras_prefix: "",
  key_objects_prefix: "",
  key_robots_prefix: "",
  key_trajectories_prefix: ""
};

var SCHEMA_ROBOT_MODEL = {
  articulated_body: {},
  key_q: ""
};

var SCHEMA_OBJECT_MODEL = {
  key_graphics: [{}],
  key_ori: "",
  key_pos: ""
};

var SCHEMA_TRAJECTORY_MODEL = {
  key_pos: ""
};

$(document).ready(function() {

  // Set up web socket
  $.get("/get_websocket_port", function(ws_port) {
    let ws = new WebSocket("ws://" + window.location.hostname + ":" + ws_port);
    ws.onmessage = (e) => new Response(e.data).arrayBuffer().then(handleMessage);
  });

  let camera, scene, renderer, raycaster, controls;
  let args = null;

  let interaction = {
    key_object: "",
    idx_link: 0,
    pos_click_in_link: [0,0,0],
    pos_mouse_in_world: [0,0,0],
    modifier_keys: [],
    key_down: ""
  };
  let lineMouseDrag = null;

  let onRedisKeyUpdate = {};
  let robots = {};
  let objects = {};
  let trajectories = {};

  init_graphics();

  function handleMessage(e) {

    var msg = JSON.parse(e.data);
    var updateKeys = msg["update"];
    var delKeys = msg["delete"];

    // Look for webapp args first
    if (args === null) {
      updateKeys.forEach((m) => {
        if (m[0] != KEY_ARGS) return;
        args = JSON.parse(m[1]);
      });
      if (args === null) return;
    }

    // Look for updated objects
    updateKeys.forEach(function(keyVal) {
      let key = keyVal[0];
      let val = keyVal[1];
      if (key.startsWith(args.key_models_prefix)) {
        const redisModel = JSON.parse(val);
        if ("key_q" in redisModel) {
          onRedisKeyUpdate[redisModel.key_q] = (key_q, val) => {
            const result = updateRobotQ(robots[key].bodies, val[0]);
            updateInteraction(key, robots[key].bodies);
            return result;
          }
        }
        if ("key_traj" in redisModel) {
          onRedisKeyUpdate[redisModel.key_traj] = (key_traj, val) => {
            return updateTrajectoryTrail(key, val[0]);
          }
        }
        addRobotToScene(key, redisModel.model);
      } else if (key.startsWith(args.key_objects_prefix)) {
        const redisObj = JSON.parse(val);
        if ("key_pos" in redisObj) {
          onRedisKeyUpdate[redisObj.key_pos] = (key_pos, val) => {
            const result = updateObjectPos(key, val[0]);
            updateInteraction(key, objects[key]);
            return result
          }
        }
        if ("key_ori" in redisObj) {
          onRedisKeyUpdate[redisObj.key_ori] = (key_ori, val) => {
            return updateObjectOri(key, val[0]);
          }
        }
        addObjectToScene(key, redisObj.graphics);
      }

      // Update html
      if (!redis.formExists(key)) {
        redis.updateForm(key, val, true, true, true);
      }
    });

    let renderFrame = false;

    // Call update callbacks
    updateKeys.forEach(function(keyVal) {
      let key = keyVal[0];
      let val = keyVal[1];
      if (key in onRedisKeyUpdate) {
        renderFrame = onRedisKeyUpdate[key](key, val) || renderFrame;
      }

      // Update html
      redis.updateForm(key, val, true, true, true);
    });

    delKeys.forEach(function(key) {
      redis.deleteForm(key);
    })

    if (renderFrame) {
      renderer.render(scene, camera);
    }

  };

  function getPosMouse(event) {
    const $canvas = $(renderer.domElement);
    const offset = $canvas.offset();
    return new THREE.Vector2((event.clientX - offset.left) / $canvas.width() * 2 - 1,
                             -(event.clientY - offset.top) / $canvas.height() * 2 + 1);
  }

  function getAllMeshes() {
    let meshes = [];

    // Traverse down object tree
    const findMeshes = (obj) => {
      if (obj.type == "Mesh") {
        meshes.push(obj);
      }
      for (const child of obj.children) {
        findMeshes(child);
      }
    }

    // Find all robot meshes
    for (let key in robots) {
      findMeshes(robots[key].base);
    }

    // Find all object meshes
    for (let key in objects) {
      findMeshes(objects[key]);
    }

    return meshes;
  }

  function getModifierKeys(event) {
    let keys = [];
    if (event.altKey) keys.push("alt");
    if (event.ctrlKey) keys.push("ctrl");
    if (event.metaKey) keys.push("meta");
    if (event.shiftKey) keys.push("shift");
    return keys;
  }

  function updateInteraction(key, bodies) {
    // Update body position in mouse drag line
    if (!lineMouseDrag || key !== interaction.key_object) return;

    let posClick = new THREE.Vector3();
    posClick.fromArray(interaction.pos_click_in_link);
    if (bodies.constructor === Array) {
      bodies[interaction.idx_link].localToWorld(posClick);
    } else {
      bodies.localToWorld(posClick);
    }
    lineMouseDrag.array[0] = posClick.x;
    lineMouseDrag.array[1] = posClick.y;
    lineMouseDrag.array[2] = posClick.z;
    lineMouseDrag.needsUpdate = true;
  }

  function findIntersectedObject(intersect, objectMap, isEqual) {
    let object = intersect.object;
    while (object.parent) {
      for (let key in objectMap) {
        if (!isEqual) {
          if (objectMap[key] != object) continue;
          return [key, object];
        }
        if (isEqual(objectMap[key], object)) {
          return [key, object];
        }
      }
      object = object.parent;
    }
    return ["", null];
  }

  function handleInteraction(event) {
    $(this).focus();
    if (event.which != 1) return;
    if (getModifierKeys(event).length === 0) return;
    event.stopImmediatePropagation();

    // Cast ray from mouse
    if (!raycaster) raycaster = new THREE.Raycaster();
    const posMouseDown = getPosMouse(event);
    raycaster.setFromCamera(posMouseDown, camera);
    const intersects = raycaster.intersectObjects(getAllMeshes());
    if (intersects.length === 0) return;

    // Find intersected body
    const intersect = intersects[0];
    let key_val = findIntersectedObject(intersect, robots,
                                        (robot, object) => robot.bodies.includes(object));
    if (!key_val[0]) {
      key_val = findIntersectedObject(intersect, objects)
    }
    if (!key_val[0]) return;

    const key_object = key_val[0];
    const object     = key_val[1];
    interaction.key_object = key_object;
    if (key_object in robots) {
      interaction.idx_link = robots[key_object].bodies.indexOf(object);
    }
    let posClickInBody = intersect.point.clone();
    object.worldToLocal(posClickInBody);
    interaction.pos_click_in_link = posClickInBody.toArray();
    interaction.modifier_keys = getModifierKeys(event);

    // Create mouse line
    let lineGeometry = new THREE.BufferGeometry();
    let lineVertices = new Float32Array([
        intersect.point.x, intersect.point.y, intersect.point.z,
        intersect.point.x, intersect.point.y, intersect.point.z
    ]);
    lineGeometry.addAttribute("position", new THREE.BufferAttribute(lineVertices, 3));
    let lineMaterial = new THREE.LineBasicMaterial({ color: 0xffffff  });
    let line = new THREE.Line(lineGeometry, lineMaterial);
    scene.add(line);

    // Compute distance from camera to intersect
    let lookat = controls.target.clone().sub(camera.position).normalize();
    let vecCameraToIntersect = intersect.point.clone();
    vecCameraToIntersect.sub(camera.position);
    const distLookat = lookat.dot(vecCameraToIntersect);

    const mouseMove = (e) => {
      // Get mouse world position
      const posMouseInCamera = getPosMouse(e);
      let posMouse = new THREE.Vector3(posMouseInCamera.x, posMouseInCamera.y, 0.5);
      posMouse.unproject(camera);

      // Set distance between mouse point and camera
      camera.worldToLocal(posMouse);
      posMouse.multiplyScalar(-distLookat / posMouse.z);
      camera.localToWorld(posMouse);

      // Update mouse point
      lineMouseDrag = line.geometry.attributes.position;
      lineMouseDrag.array[3] = posMouse.x;
      lineMouseDrag.array[4] = posMouse.y;
      lineMouseDrag.array[5] = posMouse.z;
      lineMouseDrag.needsUpdate = true;

      // Send Redis keys
      interaction.pos_mouse_in_world = posMouse.toArray();
      redis.sendAjax("SET", KEY_INTERACTION, interaction);
      redis.updateForm(KEY_INTERACTION, JSON.stringify(interaction));

      renderer.render(scene, camera);
    };
    const mouseUp = (e) => {
      $(document).off("mousemove", mouseMove);
      $(document).off("mouseup", mouseUp);
      lineMouseDrag = null;
      scene.remove(line);
      interaction.key_object = "";
      interaction.idx_link = 0;
      interaction.pos_click_in_link = [0,0,0];
      interaction.pos_mouse_in_world = [0,0,0];
      interaction.modifier_keys = [];
      redis.sendAjax("SET", KEY_INTERACTION, interaction);
      redis.updateForm(KEY_INTERACTION, JSON.stringify(interaction));
      renderer.render(scene, camera);
    }
    $(document).on("mousemove", mouseMove);
    $(document).on("mouseup", mouseUp);
  }

  function init_graphics() {

    var width = window.innerWidth - $("#sidebar").width();
    var height = window.innerHeight - $("#plotly").height() - 4;

    camera = new THREE.PerspectiveCamera(50, width / height, 0.01, 100);
    camera.position.set(1.25, -1.25, 1);
    camera.up.set(0, 0, 1);
    camera.updateProjectionMatrix();

    scene = new THREE.Scene();

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    $("#threejs").html(renderer.domElement);

    $(renderer.domElement).on("mousedown", handleInteraction);
    $(renderer.domElement).attr("tabindex", -1);
    $(renderer.domElement).on("focusin", () => {
      $(document).on("keydown", keyDown);
      $(document).on("keyup", keyUp);
    }).on("focusout", () => {
      $(document).off("keydown", keyDown);
      $(document).off("keyup", keyUp);
      keyUp();
    });

    function keyDown(e) {
      if (e.key != interaction.key_down) {
        interaction.key_down = e.key;
        redis.sendAjax("SET", KEY_INTERACTION, interaction);
        redis.updateForm(KEY_INTERACTION, JSON.stringify(interaction));
      }
    }
    function keyUp() {
      interaction.key_down = "";
      redis.sendAjax("SET", KEY_INTERACTION, interaction);
      redis.updateForm(KEY_INTERACTION, JSON.stringify(interaction));
    }
    redis.sendAjax("SET", KEY_INTERACTION, interaction);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableKeys = false;
    camera.updateProjectionMatrix();
    redis.addForm(KEY_CAMERA_TARGET, [controls.target.toArray()], true, false, false, (key, val) => {
      controls.target.fromArray(val[0]);
      controls.update();
      renderer.render(scene, camera);
    });
    redis.addForm(KEY_CAMERA_POS, [controls.object.position.toArray()], true, false, false, (key, val) => {
      console.log(val[0]);
      camera.position.fromArray(val[0]);
      camera.updateProjectionMatrix();
      controls.update();
      renderer.render(scene, camera);
    });
    controls.addEventListener("change", function() {
      renderer.render(scene, camera);
      redis.updateForm(KEY_CAMERA_TARGET, [controls.target.toArray()]);
      redis.updateForm(KEY_CAMERA_POS, [controls.object.position.toArray()]);
    });

    // redis.addForm("trajectory_trail::reset", [[0]], true, false, false, (key, val) => {
    //   reset_trajectory_trail();
    //   renderer.render(scene, camera);
    // });

    var grid = new THREE.GridHelper(1, 10);
    grid.rotation.x = Math.PI / 2;
    scene.add(grid);
    scene.add(graphics.axes(AXIS_SIZE, AXIS_WIDTH));

    var light = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(light);

    light = new THREE.PointLight(0xffffff, 0.8);
    light.position.set(1, -1, 1);
    scene.add(light);

    light = new THREE.PointLight(0xffffff, 0.8);
    light.position.set(-1, 1, 1);
    scene.add(light);

    renderer.render(scene, camera);
  }

  function addObjectToScene(key, object) {

    // Remove existing object
    if (key in objects) {
      scene.remove(objects[key]);
    }

    // Create object
    let obj = new THREE.Object3D();

    // Load graphics
    let promises = [];
    object.forEach((graphicsStruct) => {
      graphics.parse(graphicsStruct, obj, promises);
    });

    // Add to objects map
    objects[key] = obj;

    // Render when graphics have finished loading
    Promise.all(promises).then(() => {
      scene.add(obj);
      renderer.render(scene, camera);
    });

  }

  function updateObjectPos(key, pos) {
    objects[key].position.fromArray(pos);
  }

  function updateObjectOri(key, quat) {
    objects[key].quaternion.set(quat[0], quat[1], quat[2], quat[3]);
  }

  function addRobotToScene(key, ab) {

    // Remove existing robot
    if (key in robots) {
      return;
      scene.remove(robots[key].base);
    }

    // Create base
    let base = new THREE.Object3D();
    base.quaternion.set(ab.quat.x, ab.quat.y, ab.quat.z, ab.quat.w);
    base.position.fromArray(ab.pos);

    // Load base graphics
    let promises = [];
    ab.graphics.forEach((graphicsStruct) => {
      graphics.parse(graphicsStruct, base, promises);
    });

    // Iterate over rigid bodies
    let bodies = [];
    ab.rigid_bodies.forEach((rb) => {

      // Set parent
      let parent = rb.id_parent < 0 ? base : bodies[rb.id_parent];

      // Create body
      let body = new THREE.Object3D();
      body.quaternion.set(rb.quat.x, rb.quat.y, rb.quat.z, rb.quat.w);
      body.position.fromArray(rb.pos);

      // Find joint axis
      let axis;
      switch (rb.joint.type[1].toLowerCase()) {
        case "x":
          axis = new THREE.Vector3(1, 0, 0);
          break;
        case "y":
          axis = new THREE.Vector3(0, 1, 0);
          break;
        case "z":
          axis = new THREE.Vector3(0, 0, 1);
          break;
      }

      // Add custom fields to THREE.Object3D
      body.spec = {
        quaternion: body.quaternion.clone(),
        position:   body.position.clone(),
        joint_type: rb.joint.type[0],
        joint_axis: axis
      };

      // Load body graphics
      rb.graphics.forEach((graphicsStruct) => {
        graphics.parse(graphicsStruct, body, promises);
      });

      // Add frame axes
      body.add(graphics.axes(AXIS_SIZE, AXIS_WIDTH));

      // Add body to parent
      bodies.push(body);
      parent.add(body);
    });

    // Add to robots map
    robots[key] = {
      base: base,
      bodies: bodies
    };

    // Render when graphics have finished loading
    Promise.all(promises).then(() => {
      scene.add(base);
      renderer.render(scene, camera);
    });

  }

  function updateRobotQ(bodies, q) {

    for (var i = 0; i < bodies.length; i++) {
      // Update orientation in parent
      let quat = new THREE.Quaternion(0, 0, 0, 1);
      if (bodies[i].spec.joint_type.toLowerCase() == "r") {
        quat.setFromAxisAngle(bodies[i].spec.joint_axis, q[i]);
      }
      quat.premultiply(bodies[i].spec.quaternion);

      // Update position in parent
      let pos = new THREE.Vector3(0, 0, 0);
      if (bodies[i].spec.joint_type.toLowerCase() == "p") {
        pos.copy(bodies[i].spec.joint_axis);
        pos.multiplyScalar(q[i]);
      }
      pos.add(bodies[i].spec.position);

      bodies[i].quaternion.copy(quat);
      bodies[i].position.copy(pos);
    }

    return true;
  }

  function updateTrajectoryTrail(key, pos) {

    if (!(key in trajectories)) {
      trajectories[key] = {
        idx: 0,
        len: 0,
        trails: []
      };
      let traj = trajectories[key];

      let material = new THREE.LineBasicMaterial({ color: 0xffffff });
      let positions = new Float32Array(3 * (LEN_TRAJECTORY_TRAIL + 1));
      let buffer = new THREE.BufferAttribute(positions, 3);

      for (var i = 0; i < 2; i++) {
        let geometry = new THREE.BufferGeometry();
        geometry.setDrawRange(0, 0);
        geometry.addAttribute("position", buffer);
        traj.trails.push(new THREE.Line(geometry, material));
        scene.add(traj.trails[i]);
      }

    }

    let traj = trajectories[key];

    traj.trails[0].geometry.attributes.position.set(pos, 3 * traj.idx);
    traj.idx++;
    if (traj.idx > LEN_TRAJECTORY_TRAIL) {
      traj.trails[0].geometry.attributes.position.set(pos, 0);
      traj.idx = 1;
    }

    if (traj.len < LEN_TRAJECTORY_TRAIL) {
      traj.len++;
      traj.trails[0].geometry.setDrawRange(0, traj.len);
      traj.trails[0].geometry.attributes.position.needsUpdate = true;
    } else {
      traj.trails[0].geometry.setDrawRange(0, traj.idx);
      traj.trails[0].geometry.attributes.position.needsUpdate = true;
      traj.trails[1].geometry.setDrawRange(traj.idx, LEN_TRAJECTORY_TRAIL - traj.idx + 1);
      traj.trails[1].geometry.attributes.position.needsUpdate = true;
    }

  }

  function resetTrajectoryTrail(key) {
    if (!(key in trajectories)) return;

    let traj = trajectories[key];
    traj.idx = 0;
    traj.len = 0;

    traj.trails[0].geometry.setDrawRange(0, 0);
    traj.trails[0].geometry.attributes.position.needsUpdate = true;
    traj.trails[1].geometry.setDrawRange(0, 0);
    traj.trails[1].geometry.attributes.position.needsUpdate = true;
  }

  // $(window).resize(function() {
  //     var width = window.innerWidth - $("#sidebar").width();
  //     var height = window.innerHeight - $("#plotly").height();
  //     camera.aspect = width / height;
  //     camera.updateProjectionMatrix();
  //     renderer.setSize(width, height);
  //     renderer.render(scene, camera);
  // })
  $("body").on("resize", ".ui-resizable", function() {
    var width = window.innerWidth - $("#sidebar").width();
    var height = $("#threejs").height() - 4;
    $("#plotly").height(window.innerHeight - $("#threejs").height());
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    renderer.render(scene, camera);
  });

  // $("#threejs").on("mousemove", function(e) {
  //     var offset = $("#threejs").offset();
  //     mouse.x = (e.clientX - offset.left) / $("#threejs").width() * 2 - 1;
  //     mouse.y = -(e.clientY - offset.top) / $("#threejs").height() * 2 + 1;
  // });

  // Copy values to clipboard
  $(document).on("click", "input.copy", function(e) {
    e.preventDefault();

    // Get val
    var $form = $(this).closest("form");
    var val = redis.matrixToString(redis.getMatrix($form));

    // Create temporary input to copy to clipboard
    var $temp = $("<input>");
    $("body").append($temp);
    $temp.val(val).select();
    document.execCommand("copy");
    $temp.remove();
  });

  // Copy values to clipboard
  $(document).on("click", "input.del", function(e) {
    e.preventDefault();

    // Get val
    var $form = $(this).closest("form");
    var key = $form.attr("data-key");
    redis.sendAjax("DEL", key, "", true);

  });

  $(".col-split > div:first-child").resizable({
    handles: "e"
  });

  $(".row-split > div:first-child").resizable({
    handles: "s"
  });

});
