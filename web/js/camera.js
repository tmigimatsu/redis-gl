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
  let material = new THREE.PointsMaterial({ size: 0.01, vertexColors: THREE.VertexColors });
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
    colorImage: null,
    depthImage: null,
    depthDim: [0, 0, 0],
    colorDim: [0, 0, 0],
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

let CV_TYPES = {
  "0": "CV_8UC1",
  "8": "CV_8UC2",
  "16": "CV_8UC3",
  "24": "CV_8UC4",
  "2": "CV_16UC1",
  "10": "CV_16UC2",
  "18": "CV_16UC3",
  "26": "CV_16UC4",
  "5": "CV_32FC1",
  "13": "CV_32FC2",
  "11": "CV_32FC3",
  "29": "CV_32FC4",
}

function getOpenCvType(buffer) {
  let word = "";
  let idx = 0;
  let char = String.fromCharCode(buffer[idx++]);
  while (char != " ") {
    word += char;
    char = String.fromCharCode(buffer[idx++]);
  }
  if (!(word in CV_TYPES)) return ["custom", idx];
  const type = CV_TYPES[word];
  return [type, idx];
}

function getBufferSize(buffer, idx) {
  let word = "";
  let char = String.fromCharCode(buffer[idx++]);
  while (char != " ") {
    word += char;
    char = String.fromCharCode(buffer[idx++]);
  }
  const size = parseInt(word);
  return [size, idx];
}

function parseOpenCvMat(opencv_mat) {
  // Parse opencv_mat message
  let buffer_prefix = new Uint8Array(opencv_mat);
  let [type, idx_buffer_prefix] = getOpenCvType(buffer_prefix);

  let promise_img = null;
  let numRows = 0;
  let numCols = 0;
  let numChannels = 0;
  if (type.includes("CV_32FC")) {
    let size;
    [size, idx_buffer_prefix] = getBufferSize(buffer_prefix, idx_buffer_prefix);
    let buffer_exr = opencv_mat.slice(idx_buffer_prefix);

    let exr_loader = new THREE.EXRLoader();
    let exr = exr_loader.parse(buffer_exr);

    let img = exr.data;
    numRows = exr.height;
    numCols = exr.width;
    numChannels = img.length / (numRows * numCols);

    promise_img = new Promise((resolve, reject) => { resolve(exr.data); });
  } else if (type.includes("CV_")) {
    let size;
    [size, idx_buffer_prefix] = getBufferSize(buffer_prefix, idx_buffer_prefix);
    const dv = new DataView(opencv_mat);
    numCols = dv.getUint32(idx_buffer_prefix + 16);
    numRows = dv.getUint32(idx_buffer_prefix + 20);
    numChannels = 4;

    let buffer_png = buffer_prefix.subarray(idx_buffer_prefix);
    let png_data = "";
    for (let i = 0; i < buffer_png.byteLength; i++) {
      png_data += String.fromCharCode(buffer_png[i]);
    }

    promise_img = new Promise((resolve, reject) => {
      let image = new Image(numCols, numRows);
      image.onload = () => {
        let canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        let ctx = canvas.getContext("2d");
        ctx.drawImage(image, 0, 0);
        const img_data = ctx.getImageData(0, 0, image.width, image.height);
        resolve(img_data.data);
      }
      image.src = "data:image/png;base64," + window.btoa(png_data);
    });
  } else if (type == "custom") {
    // Custom format.
    let dimOpenCv = [];
    let idx = 0;
    while (dimOpenCv.length < 3) {
      let word = "";
      let char = String.fromCharCode(buffer[idx++]);
      while (char != " ") {
        word += char;
        char = String.fromCharCode(buffer[idx++]);
      }
      dimOpenCv.push(parseInt(word));
    }
    let img;
    switch (dimOpenCv[2]) {
      case 0: img = new Uint8Array(opencv_mat.subarray(idx)); break;
      case 1: img = new Int8Array(opencv_mat.subarray(idx)); break;
      case 2: img = new Uint16Array(opencv_mat.subarray(idx)); break;
      case 3: img = new Int16Array(opencv_mat.subarray(idx)); break;
      case 4: img = new Int32Array(opencv_mat.subarray(idx)); break;
      case 5: img = new Float32Array(opencv_mat.subarray(idx)); break;
      case 6: img = new Float64Array(opencv_mat.subarray(idx)); break;
    }
    numRows = dimOpenCv[0];
    numCols = dimOpenCv[1];
    numChannels = img.length / (dimOpenCv[0] * dimOpenCv[1]);

    promise_img = new Promise((resolve, reject) => { resolve(img); });
  }

  // Returns a promise because png loading isn't synchronous.
  return [promise_img, [numRows, numCols, numChannels]];
}

var updatingDepth = false;

export function updateDepthImage(camera, opencv_mat, renderCallback) {
  if (updatingDepth) return false;
  updatingDepth = true;
  const [promise_img, dim] = parseOpenCvMat(opencv_mat);
  promise_img.then((img) => {
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
    spec.depthDim = dim;

    renderPointCloud(camera);
    renderCallback();
    updatingDepth = false;
  });
  return false;
}

var updatingColor = false;

export function updateColorImage(camera, opencv_mat, renderCallback) {
  if (updatingColor) return false;
  updatingColor = true;
  const [promise_img, dim] = parseOpenCvMat(opencv_mat);
  promise_img.then((img) => {
    let spec = camera.redisgl;
    if (spec.colorImage === null) {
      // Create new buffer
      let points = camera.children[0];
      let geometry = points.geometry;
      let buffer = new Float32Array(3 * dim[0] * dim[1]);
      geometry.addAttribute("color", new THREE.Float32BufferAttribute(buffer, 3));
      geometry.attributes.color.dynamic = true;
    }

    // Update specs
    spec.colorImage = img;
    spec.colorDim = dim;

    renderPointCloud(camera);
    renderCallback();
    updatingColor = false;
  });
  return false;
}

function renderPointCloud(camera) {
  let spec = camera.redisgl;
  if (spec.depthImage === null || spec.intrinsic === null) return false;

  const K = spec.intrinsic;
  const numRows = spec.depthDim[0];
  const numCols = spec.depthDim[1];
  let points = camera.children[0];
  let buffer = points.geometry.attributes.position.array;

  // Update points
  let idx = 0;
  for (let y = 0; y < numRows; y++) {
    for (let x = 0; x < numCols; x++) {
      let d = spec.depthImage[numCols * y + x] / 1000; // mm to m.
      if (isNaN(d) || d <= 0) continue;
      buffer[3 * idx + 0] = d * (x - K[0][2]) / K[0][0];
      buffer[3 * idx + 1] = d * ((numRows - y) - K[1][2]) / K[1][1];
      buffer[3 * idx + 2] = d;
      idx++;
    }
  }

  // Update point cloud
  points.geometry.setDrawRange(0, idx);
  points.geometry.attributes.position.needsUpdate = true;
  // points.geometry.computeBoundingBox();

  // Check if color image is registered to depth.
  const numColorRows = spec.colorDim[0]
  const numColorCols = spec.colorDim[1];
  if (spec.colorImage === null || numColorRows != numRows || numColorCols != numCols) return true;

  let colorBuffer = points.geometry.attributes.color.array;
  const numChannels = spec.colorDim[2];

  // Update colors.
  idx = 0;
  for (let y = 0; y < numRows; y++) {
    let idxRow = (numRows - y) * numCols * numChannels;
    for (let x = 0; x < numCols; x++) {
      let idxCol = x * numChannels;
      let d = spec.depthImage[numCols * y + x] / 1000; // mm to m.
      if (isNaN(d) || d <= 0) continue;
      for (let c = 0; c < 3; c++) {
        colorBuffer[3 * idx + c] = spec.colorImage[idxRow + idxCol + c] / 255;
      }
      idx++;
    }
  }
  points.geometry.attributes.color.needsUpdate = true;
  console.log(points);

  return true;
}

function renderCameraViewFrame(camera) {
  let spec = camera.redisgl;
  if (spec.intrinsic === null) return false;
  let frame = camera.children[1];

  // Get pixel coordinates of corners
  const numRows = spec.depthDim[0];
  const numCols = spec.depthDim[1];
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

