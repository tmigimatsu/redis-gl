/**
 * robot.js
 *
 * Copyright 2019. All Rights Reserved.
 *
 * Created: July 27, 2019
 * Authors: Toki Migimatsu
 */

import * as Redis from "./redis.js"

export function create(model, loadCallback) {
  const ab = model["articulated_body"];

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
    body.redisgl = {
      quaternion: body.quaternion.clone(),
      position:   body.position.clone(),
      jointType: rb.joint.type[0],
      jointAxis: axis
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

  // Add custom field to THREE.Object3D
  base.redisgl = {
    bodies: bodies,
    q: bodies.map(() => 0)
  };

  Promise.all(promises).then(() => loadCallback(base));
  return base;
}

export function updateQ(robot, val) {
  const q = Redis.makeNumeric(val[0]);
  const spec = robot.redisgl;
  let bodies = spec.bodies;
  spec.q = q;

  for (var i = 0; i < bodies.length; i++) {
    let body = bodies[i];
    const spec = body.redisgl;

    // Update orientation in parent
    let quat = new THREE.Quaternion();
    if (spec.jointType.toLowerCase() == "r") {
      quat.setFromAxisAngle(spec.jointAxis, q[i]);
    }
    quat.premultiply(spec.quaternion);

    // Update position in parent
    let pos = new THREE.Vector3();
    if (spec.jointType.toLowerCase() == "p") {
      pos.copy(spec.jointAxis);
      pos.multiplyScalar(q[i]);
    }
    pos.add(spec.position);

    body.quaternion.copy(quat);
    body.position.copy(pos);
  }

  return true;
}
