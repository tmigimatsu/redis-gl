/**
 * camera.js
 *
 * Copyright 2019. All Rights Reserved.
 *
 * Created: July 27, 2019
 * Authors: Toki Migimatsu
 */

import * as Redis from "./redis.js"
import * as ImageView from "./image.js"

export function create(model_key, model, loadCallback) {
	let camera = new THREE.Object3D();

	// Create point cloud
	let geometry = new THREE.BufferGeometry();
	let material = new THREE.PointsMaterial({ size: 0.01, vertexColors: THREE.VertexColors });
	let points = new THREE.Points(geometry, material);
	camera.add(points);

	// Create frame: add a line from the origin to each frame corner
	let frame = new THREE.Object3D();
	frame.frustumCulled = false;
	for (let i = 0; i < 8; i++) {
		let geometry = new THREE.BufferGeometry();
		let vertices = new Float32Array(6);
		geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
		geometry.setDrawRange(0, 2);
		let material = new THREE.LineBasicMaterial();
		let line = new THREE.Line(geometry, material);
		line.frustumCulled = false;
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
		model: model,
		model_key: model_key,
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

var updatingDepth = false;

export function updateDepthImage(camera, opencv_mat, renderCallback) {
	if (opencv_mat.constructor !== ArrayBuffer) return false;
	if (updatingDepth) return false;
	updatingDepth = true;
	Redis.parseImageOrTensor(opencv_mat).then((result) => {
		const [img, shape] = result;
		let spec = camera.redisgl;
		if (spec.depthImage === null) {
			// Create new buffer
			let points = camera.children[0];
			let geometry = points.geometry;
			let len_buffer = 3 * img.length / (spec.model.downscale_factor * spec.model.downscale_factor);
			let buffer = new Float32Array(len_buffer);
			geometry.setAttribute("position", new THREE.Float32BufferAttribute(buffer, 3));
			geometry.attributes.position.dynamic = true;
			geometry.setDrawRange(0, 0);
			points.frustumCulled = false;

			let buffer_color = new Float32Array(len_buffer);
			for (let i = 0; i < buffer_color.length; i++) { buffer_color[i] = 1.0; }
			geometry.setAttribute("color", new THREE.Float32BufferAttribute(buffer_color, 3));
			geometry.attributes.color.dynamic = true;
		}

		// Update specs
		spec.depthImage = img;
		spec.depthDim = shape;

		renderCameraViewFrame(camera);
		renderPointCloud(camera);
		ImageView.renderImage(camera.redisgl.model.key_depth_image, img, shape);
		if (!updatingColor) {
			renderCallback(() => {
				updatingDepth = false;
			});
		} else {
			updatingDepth = false;
		}
	});
	return false;
}

var updatingColor = false;

export function updateColorImage(camera, opencv_mat, renderCallback) {
	if (opencv_mat.constructor !== ArrayBuffer) return false;
	if (updatingColor) return false;
	updatingColor = true;
	Redis.parseImageOrTensor(opencv_mat).then((result) => {
		const [img, shape] = result;
		let spec = camera.redisgl;

		ImageView.renderImage(camera.redisgl.model.key_color_image, img, shape);
		// if (spec.colorImage === null && spec.depthImage === null) {
		//   // Create new buffer
		//   let points = camera.children[0];
		//   let geometry = points.geometry;
		//   let buffer = new Float32Array(3 * dim[0] * dim[1]);
		//   geometry.setAttribute("color", new THREE.Float32BufferAttribute(buffer, 3));
		//   geometry.attributes.color.dynamic = true;
		// }

		// Update specs
		spec.colorImage = img;
		spec.colorDim = shape;

		renderPointCloud(camera);
		if (!updatingDepth) {
			renderCallback(() => {
				updatingColor = false;
			});
		} else {
			updatingColor = false;
		}
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
		if (y % spec.model.downscale_factor != 0) continue;
		for (let x = 0; x < numCols; x++) {
			if (x % spec.model.downscale_factor != 0) continue;
			let d = 0.001 * spec.depthImage[numCols * y + x]; // mm to m.
			if (isNaN(d) || d <= 0) continue;
			buffer[3 * idx + 0] = d * (x - K[0][2]) / K[0][0];
			buffer[3 * idx + 1] = d * (y - K[1][2]) / K[1][1];
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

	const colorBuffer = points.geometry.attributes.color.array;
	const numChannels = spec.colorDim[2];

	// Update colors.
	idx = 0;
	for (let y = 0; y < numRows; y++) {
		if (y % spec.model.downscale_factor != 0) continue;
		let idxRow = y * numCols * numChannels;
		for (let x = 0; x < numCols; x++) {
			if (x % spec.model.downscale_factor != 0) continue;
			let idxCol = x * numChannels;
			let d = spec.model.depth_units * spec.depthImage[numCols * y + x]; // mm to m.
			if (isNaN(d) || d <= 0) continue;
			for (let c = 0; c < 3; c++) {
				colorBuffer[3 * idx + c] = spec.colorImage[idxRow + idxCol + c] / 255;
			}
			idx++;
		}
	}
	points.geometry.attributes.color.needsUpdate = true;

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
		const corner = corners[i].toArray();
		let geometry = frame.children[i].geometry;
		for (let j = 0; j < 3; j++) {
			geometry.attributes.position.array[j + 3] = corner[j];
		}
		geometry.attributes.position.needsUpdate = true;
	}

	// Lines between corners
	for (let i = 4; i < 8; i++) {
		const corner1 = corners[i % 4].toArray();
		const corner2 = corners[(i + 1) % 4].toArray();
		let geometry = frame.children[i].geometry;
		for (let j = 0; j < 3; j++) {
			geometry.attributes.position.array[j] = corner1[j];
		}
		for (let j = 0; j < 3; j++) {
			geometry.attributes.position.array[j + 3] = corner2[j];
		}
		geometry.attributes.position.needsUpdate = true;
	}

	return true;
}

