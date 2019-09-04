/**
 * camera.js
 *
 * Copyright 2019. All Rights Reserved.
 *
 * Created: July 27, 2019
 * Authors: Toki Migimatsu
 */

import * as Redis from "./redis.js"

export function create(key, loadCallback) {
  let camera = new THREE.Object3D();

  // Create point cloud
  let geometry = new THREE.BufferGeometry();
  let material = new THREE.PointsMaterial({ size: 0.01 });
  let points = new THREE.Points(geometry, material);
  camera.add(points);

  // Create frame: add a line from the origin to each frame corner
  let frame = new THREE.Object3D();
  for (let i = 0; i < 8; i++) {
    let geometry = new THREE.Geometry();
    geometry.vertices.push(new THREE.Vector3(), new THREE.Vector3());
    let material = new THREE.LineBasicMaterial();
    let line = new THREE.Line(geometry, material);
    frame.add(line);
  }
  camera.add(frame);

  // Add custom field to THREE.Object3D
  camera.redisgl = {
    depthImage: null,
    dim: [0, 0, 0],
    intrinsic: null,
  };

  loadCallback(camera);
  return camera;
}

export function updateIntrinsic(camera, val) {
  camera.redisgl.intrinsic = Redis.makeNumeric(val);
  return renderCameraViewFrame(camera) && renderPointCloud(camera);
}

export function updatePosition(camera, val) {
  const pos = Redis.makeNumeric(val[0]);
  camera.position.fromArray(pos);
  return true;
}

export function updateOrientation(camera, val) {
  const quat = Redis.makeNumeric(val[0]);
  camera.quaternion.set(quat[0], quat[1], quat[2], quat[3]);
  return true;
}

export function updateDepthImage(camera, opencv_mat) {
  // Parse opencv_mat message
  let bufferPrefix = new Uint8Array(opencv_mat);
  let dimOpenCv = [];
  let idx = 0;
  while (dimOpenCv.length < 3) {
    let word = "";
    let char = String.fromCharCode(bufferPrefix[idx++]);
    while (char != " ") {
      word += char;
      char = String.fromCharCode(bufferPrefix[idx++]);
    }
    dimOpenCv.push(parseInt(word));
  }
  let img = null;
  switch (dimOpenCv[2]) {
    case 0: img = new Uint8Array(opencv_mat.slice(idx)); break;
    case 1: img = new Int8Array(opencv_mat.slice(idx)); break;
    case 2: img = new Uint16Array(opencv_mat.slice(idx)); break;
    case 3: img = new Int16Array(opencv_mat.slice(idx)); break;
    case 4: img = new Int32Array(opencv_mat.slice(idx)); break;
    case 5: img = new Float32Array(opencv_mat.slice(idx)); break;
    case 6: img = new Float64Array(opencv_mat.slice(idx)); break;
  }
  const numRows = dimOpenCv[0];
  const numCols = dimOpenCv[1];
  const numChannels = img.length / (dimOpenCv[0] * dimOpenCv[1]);

  let spec = camera.redisgl;
  if (spec.depthImage === null) {
    // Create new buffer
    let points = camera.children[0];
    let geometry = points.geometry;
    let buffer = new Float32Array(3 * img.length);
    geometry.addAttribute("position", new THREE.Float32BufferAttribute(buffer, 3));
    geometry.attributes.position.dynamic = true;
    geometry.setDrawRange(0, 0);
    points.frustumCulled = false;
  }

  // Update specs
  spec.depthImage = img;
  spec.dim = [numRows, numCols, numChannels];

  return renderPointCloud(camera);
}

function renderPointCloud(camera) {
  let spec = camera.redisgl;
  if (spec.depthImage === null || spec.intrinsic === null) return false;

  const K = spec.intrinsic;
  const numRows = spec.dim[0];
  const numCols = spec.dim[1];
  let points = camera.children[0];
  let buffer = points.geometry.attributes.position.array;

  // Update points
  let idx = 0;
  for (let y = 0; y < numRows; y++) {
    for (let x = 0; x < numCols; x++) {
      const d = spec.depthImage[numCols * y + x];
      if (isNaN(d)) continue;
      buffer[3 * idx + 0] = d * (x - K[0][2]) / K[0][0];
      buffer[3 * idx + 1] = d * (y - K[1][2]) / K[1][1];
      buffer[3 * idx + 2] = d;
      idx++;
    }
  }

  // Update point cloud
  points.geometry.setDrawRange(0, idx);
  points.geometry.attributes.position.needsUpdate = true;
  return true;
}

function renderCameraViewFrame(camera) {
  let spec = camera.redisgl;
  if (spec.intrinsic === null) return false;
  let frame = camera.children[1];

  // Get pixel coordinates of corners
  const numRows = spec.dim[0];
  const numCols = spec.dim[1];
  let corners = [[0, 0], [0, numCols - 1], [numRows - 1, numCols - 1], [numRows - 1, 0]];

  // Compute 3D coordinates of corners
  const K = spec.intrinsic;
  corners = corners.map((corner) => {
    const y = corner[0];
    const x = corner[1];
    return new THREE.Vector3((x - K[0][2]) / K[0][0], (y - K[1][2]) / K[1][1], 1);
  });

  // Lines from frame origin to corners
  for (let i = 0; i < 4; i++) {
    const corner = corners[i];
    let geometry = frame.children[i].geometry;
    geometry.vertices[1].copy(corner);
    geometry.verticesNeedUpdate = true;
  }

  // Lines between corners
  for (let i = 4; i < 8; i++) {
    const corner1 = corners[i % 4];
    const corner2 = corners[(i + 1) % 4];
    let geometry = frame.children[i].geometry;
    geometry.vertices[0].copy(corner1);
    geometry.vertices[1].copy(corner2);
    geometry.verticesNeedUpdate = true;
  }
  
  return true;
}

