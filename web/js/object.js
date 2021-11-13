/**
 * object.js
 *
 * Copyright 2019. All Rights Reserved.
 *
 * Created: July 27, 2019
 * Authors: Toki Migimatsu
 */

import * as Graphics from "./graphics.js"
import * as Redis from "./redis.js"

var AXIS_WIDTH = 0.005;
var AXIS_SIZE  = 0.1;

export function create(model, loadCallback) {
  // Create object
  let object = new THREE.Object3D();

  // Load graphics
  let promises = [];
  model["graphics"].forEach((graphicsStruct) => {
    Graphics.parse(graphicsStruct, object, promises);
  });
  // object.add(Graphics.axes(AXIS_SIZE, AXIS_WIDTH));

  Promise.all(promises).then(() => loadCallback(object));
  return object;
}

export function updatePosition(object, val) {
  const pos = Redis.makeNumeric(val[0]);
  object.position.fromArray(pos);
  return true;
}

export function updateOrientation(object, val) {
  const quat = Redis.makeNumeric(val[0]);
  object.quaternion.set(quat[0], quat[1], quat[2], quat[3]);
  return true;
}
